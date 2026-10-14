import type { PrismaClient } from "@prisma/client";
import { MIN_TX, NATURE_GROUP, type SrCat, type SrData, type SrTx } from "./types";

const HISTORY_START = "2021-04-01"; // start of FY 2021-22; earlier data lacks reliable account/holder attribution

type Row = { m: string; amt: number; d: string; catId: string; cat: string; typ: string; nat: string; h: string | null };

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const n = s.length;
  return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0;
};

/**
 * Loads categorized Expenditure outflows since HISTORY_START, bucketed by month ("counts toward"
 * month, i.e. COALESCE(effectiveMonth, txnDate) in IST — the same basis the Dashboard uses) and by
 * account holder. Read-only. Transfer/Investment/Income categories are excluded by account type, and
 * uncategorized rows are excluded (they surface in the Review Queue, not here).
 */
export async function getSpendReviewData(prisma: PrismaClient): Promise<SrData> {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT TO_CHAR(COALESCE(t."effectiveMonth", t."txnDate") AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') AS m,
           (-t.amount)::float8 AS amt, t."rawDescription" AS d,
           c.id AS "catId", c.name AS cat, et.name AS typ, en.name AS nat, a.holder AS h
    FROM transactions t
    JOIN categories c ON c.id = t."categoryId"
    JOIN expense_types et ON et.id = c."expenseTypeId"
    JOIN expense_natures en ON en.id = et."expenseNatureId"
    LEFT JOIN accounts a ON a.id = t."accountId"
    WHERE en."accountType"::text = 'Expenditure' AND t.amount < 0
      AND COALESCE(t."effectiveMonth", t."txnDate") >= ${HISTORY_START}::timestamp`;

  const lastMonth = rows.reduce((mx, r) => (r.m > mx ? r.m : mx), "2021-04");
  const months: string[] = [];
  for (let y = 2021, mo = 4; ; ) {
    const label = `${y}-${String(mo).padStart(2, "0")}`;
    months.push(label);
    if (label === lastMonth) break;
    if (++mo > 12) {
      mo = 1;
      y++;
    }
  }
  const mIdx = new Map(months.map((m, i) => [m, i]));
  const nowIst = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const partialLast = lastMonth === nowIst;

  const hi = (h: string | null) => (h === "Sangeeth" ? 0 : h === "Ria" ? 1 : 2);
  const catKey = (r: Row) => r.catId;
  const cats = new Map<string, SrCat>();
  const amounts = new Map<string, number[]>();
  for (const r of rows) {
    const k = catKey(r);
    let c = cats.get(k);
    if (!c) {
      c = { id: r.catId, n: r.cat, t: r.typ, nat: r.nat, g: NATURE_GROUP[r.nat] ?? "other", med: 0, by: [0, 1, 2].map(() => Array(months.length).fill(0)) };
      cats.set(k, c);
      amounts.set(k, []);
    }
    c.by[hi(r.h)][mIdx.get(r.m)!] += r.amt;
    amounts.get(k)!.push(r.amt);
  }
  const keys = [...cats.keys()];
  const catList = keys.map((k) => {
    const c = cats.get(k)!;
    c.med = Math.round(median(amounts.get(k)!));
    c.by = c.by.map((arr) => arr.map((v) => Math.round(v)));
    return c;
  });
  const cIdx = new Map(keys.map((k, i) => [k, i]));
  const tx: SrTx[] = rows
    .filter((r) => r.amt >= MIN_TX)
    .map((r) => ({ m: mIdx.get(r.m)!, c: cIdx.get(catKey(r))!, h: hi(r.h), a: Math.round(r.amt), d: r.d.replace(/\s+/g, " ").slice(0, 60) }));

  return { months, partialLast, holders: ["Sangeeth", "Ria", "Other"], cats: catList, tx };
}
