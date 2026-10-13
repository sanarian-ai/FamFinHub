// Finds clusters of ledger transactions that look like the same real transaction entered more than
// once, for the /ledger/duplicates review page and the CSV export script. READ-ONLY — nothing here
// deletes; deletion only ever happens through the Ledger's bulkDeleteTransactions() action after a
// person has reviewed and ticked rows. See dedupe.ts for why the ingest-time exact hash misses these.
import type { PrismaClient } from "@prisma/client";
import { descriptionsLikelyMatch, normDescription } from "./dedupe";

export type ReviewRow = {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  currency: string;
  accountName: string | null;
  description: string;
  source: string;
  status: string;
  categoryId: string | null;
  categoryName: string | null;
  createdAt: string; // ISO
};

/**
 * likely    — descriptions differ in wording but share a merchant (daily-alert vs statement, or a
 *             re-parsed statement line). Pre-selected for deletion in the review UI.
 * identical — the descriptions are word-for-word the same yet the rows exist separately, so the
 *             exact-hash guard saw them as distinct (different sourceRef). Could be a genuine repeat
 *             (two identical fares). NOT pre-selected.
 * check     — a likely cluster with something that needs a human: identical same-source rows inside it
 *             (possible genuine repeats), or different categories already assigned. NOT pre-selected.
 */
export type ClusterTier = "likely" | "identical" | "check";

export type ReviewCluster = {
  key: string;
  tier: ClusterTier;
  date: string;
  amount: number;
  accountName: string | null;
  rows: ReviewRow[];
  keepId: string; // suggested survivor
  deleteIds: string[]; // suggested rows to remove (all others in the cluster)
  note: string | null;
};

type Raw = {
  id: string; d: Date; amt: number; currency: string; account_name: string | null; descr: string; src: string;
  status: string; category_id: string | null; category_name: string | null; created: Date; account_id: string | null;
};

/** Survivor preference: a categorized row (a human or rule already settled it) beats needs_review;
 * then the earliest-created row. */
function pickKeeper(rows: ReviewRow[]): ReviewRow {
  const score = (r: ReviewRow) => (r.status === "categorized" && r.categoryId ? 2 : 0) - (hasSplicedPrefix(r.description) ? 1 : 0);
  return rows.slice().sort((a, b) => score(b) - score(a) || a.createdAt.localeCompare(b.createdAt))[0];
}

/** A statement description that STARTS with a reference fragment ("Mahi/6635…/ICI154b…", "BANK/6269…/…")
 * was spliced from the neighbouring wrapped line by the PDF parser — the cleaner twin is the better survivor. */
const hasSplicedPrefix = (d: string) => /^\S{0,12}\/\d{9,}\//.test(d.trim());

export async function findDuplicateClusters(prisma: PrismaClient): Promise<ReviewCluster[]> {
  const raw = await prisma.$queryRaw<Raw[]>`
    SELECT * FROM (
      SELECT t.id, t."txnDate"::date AS d, t.amount::float8 AS amt, t.currency, t."accountId" AS account_id,
             a.name AS account_name, t."rawDescription" AS descr, t.source::text AS src, t.status::text AS status,
             t."categoryId" AS category_id, c.name AS category_name, t."createdAt" AS created,
             count(*) OVER (PARTITION BY t."txnDate"::date, t.amount, t."accountId") AS n
      FROM transactions t
      LEFT JOIN accounts a ON a.id = t."accountId"
      LEFT JOIN categories c ON c.id = t."categoryId"
    ) x WHERE n > 1 ORDER BY d DESC, amt, created`;

  const groups = new Map<string, ReviewRow[]>();
  for (const r of raw) {
    const date = r.d.toISOString().slice(0, 10);
    const key = `${date}|${r.amt}|${r.account_id ?? "none"}`;
    const row: ReviewRow = {
      id: r.id, date, amount: r.amt, currency: r.currency, accountName: r.account_name, description: r.descr,
      source: r.src, status: r.status, categoryId: r.category_id, categoryName: r.category_name, createdAt: r.created.toISOString(),
    };
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(row);
  }

  const clusters: ReviewCluster[] = [];
  for (const [gkey, rows] of groups) {
    // Connected components over "same merchant" (or word-for-word identical text).
    const parent = rows.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < rows.length; i++)
      for (let j = i + 1; j < rows.length; j++)
        if (normDescription(rows[i].description) === normDescription(rows[j].description) || descriptionsLikelyMatch(rows[i].description, rows[j].description))
          parent[find(i)] = find(j);
    const comps = new Map<number, ReviewRow[]>();
    rows.forEach((r, i) => (comps.get(find(i)) ?? comps.set(find(i), []).get(find(i))!).push(r));

    for (const [root, comp] of comps) {
      if (comp.length < 2) continue;
      const norms = comp.map((r) => normDescription(r.description));
      const allIdentical = new Set(norms).size === 1;
      // identical-text rows that come from the SAME source: a re-read would normally collide on the exact
      // hash, so two surviving rows usually mean the source really listed it twice (genuine repeat).
      const sameSourceIdentical = comp.some((a, i) => comp.some((b, j) => j > i && norms[i] === norms[j] && a.source === b.source));
      const cats = new Set(comp.filter((r) => r.status === "categorized" && r.categoryId).map((r) => r.categoryId));
      let tier: ClusterTier = allIdentical ? "identical" : "likely";
      let note: string | null = null;
      if (tier === "likely" && sameSourceIdentical) { tier = "check"; note = "Contains identical rows from the same source — one may be a genuine repeat."; }
      if (tier === "likely" && cats.size > 1) { tier = "check"; note = "Rows already carry different categories — pick the right one."; }
      if (tier === "identical") note = "Word-for-word identical — could be a genuine repeat purchase.";
      // Rows that all came from the one-time spreadsheet load: two lines with the same merchant, date and
      // amount but different UTR/reference numbers are usually two real payments (e.g. two Rs 505 BharatPe
      // payments the same day). Never pre-select these.
      if (tier === "likely" && comp.every((r) => r.source === "migration")) { tier = "check"; note = "All from the original spreadsheet load — differing reference numbers usually mean separate payments."; }
      // A card statement lists each charge once, so when daily alerts and statement lines disagree on
      // the count, say so — it tells the reviewer how many genuine transactions to expect.
      const nDaily = comp.filter((r) => r.source === "gmail_daily").length, nRecon = comp.filter((r) => r.source === "gmail_monthly_reconcile").length;
      if (tier === "check" && nDaily > 0 && nRecon > 0 && nDaily !== nRecon) note = `${nDaily} daily alert${nDaily > 1 ? "s" : ""} vs ${nRecon} statement line${nRecon > 1 ? "s" : ""} — the statement is the authoritative count.`;
      const keeper = pickKeeper(comp);
      clusters.push({
        key: `${gkey}#${root}`, tier, date: comp[0].date, amount: comp[0].amount, accountName: comp[0].accountName,
        rows: comp.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
        keepId: keeper.id, deleteIds: comp.filter((r) => r.id !== keeper.id).map((r) => r.id), note,
      });
    }
  }
  return clusters.sort((a, b) => b.date.localeCompare(a.date));
}
