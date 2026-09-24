/**
 * Server-side loader for the retirement baseline screen. Lives here (not in src/lib/retirement)
 * because it reads the ledger's own models (Category, Transaction) directly — outside the narrow
 * RetirementDb interface the portable, unit-tested engine/store/persist layer is built against.
 */
import { prisma } from "@/lib/prisma";
import type { AssetClassRow } from "@/lib/portfolio/networth";

const PLAN_NAME = "Household retirement plan";

export async function getBaselinePlanId(): Promise<string> {
  const plan = await prisma.retirementPlan.findFirst({ where: { name: PLAN_NAME, archivedAt: null } });
  if (!plan) throw new Error(`No retirement plan named "${PLAN_NAME}" found.`);
  return plan.id;
}

export type LedgerActual = { totalL: number; n: number; categories: string[] };

/**
 * Trailing 12 months of gross outflow (Decimal amount < 0, abs summed) per baseline item, from
 * its linked ledger categories — a rolling window ending this month, not the fixed Sep 2025-Aug
 * 2026 window the current defaults were derived from. Only items with at least one
 * RetirementBaselineLink row appear in the result; everything else has no ledger reference.
 */
export async function getLedgerActuals(planId: string): Promise<Record<string, LedgerActual>> {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const start = new Date(Date.UTC(end.getUTCFullYear() - 1, end.getUTCMonth(), 1));

  const links = await prisma.retirementBaselineLink.findMany({
    where: { item: { planId } },
    include: { item: { select: { key: true } }, category: { select: { id: true, name: true } } },
  });
  if (links.length === 0) return {};

  const catsByKey = new Map<string, { id: string; name: string }[]>();
  for (const l of links) {
    const arr = catsByKey.get(l.item.key) ?? [];
    arr.push(l.category);
    catsByKey.set(l.item.key, arr);
  }

  const allCatIds = [...new Set(links.map((l) => l.category.id))];
  const txns = await prisma.transaction.findMany({
    where: {
      categoryId: { in: allCatIds },
      amount: { lt: 0 },
      OR: [
        { effectiveMonth: { gte: start, lt: end } },
        { AND: [{ effectiveMonth: null }, { txnDate: { gte: start, lt: end } }] },
      ],
    },
    select: { categoryId: true, amount: true },
  });
  const byCategory = new Map<string, { totalAbs: number; n: number }>();
  for (const t of txns) {
    if (!t.categoryId) continue;
    const cur = byCategory.get(t.categoryId) ?? { totalAbs: 0, n: 0 };
    cur.totalAbs += Math.abs(Number(t.amount));
    cur.n += 1;
    byCategory.set(t.categoryId, cur);
  }

  const out: Record<string, LedgerActual> = {};
  for (const [key, cats] of catsByKey) {
    let totalAbs = 0, n = 0;
    for (const c of cats) {
      const agg = byCategory.get(c.id);
      if (agg) { totalAbs += agg.totalAbs; n += agg.n; }
    }
    out[key] = { totalL: totalAbs / 1e5, n, categories: cats.map((c) => c.name) };
  }
  return out;
}

export type NetWorthActual = { valueL: number; asOf: string | null };

/**
 * Live current values for the net-worth-by-asset-class rows that have an existing data provider
 * (see src/lib/retirement/networth.ts NETWORTH_CLASSES): international equity from the US
 * portfolio engine, PMS from Kabir's snapshot+price query, mutual funds from the CAMS-ingested
 * MF_FOLIO accounts (split 4 ways by Security.mfCategory), EPF + NPS from the RETIREMENT_TRACKED
 * accounts seeded via the INDmoney MCP (value-only — no unit-level data exists for these two),
 * NSE's own listed shares from the ZERODHA/KOTAK_SECURITIES accounts, and Indian direct equity
 * from the IIFL_DEMAT account (both real units, seeded via seed-holdings.ts same as Kabir PMS).
 *
 * The actual per-class queries live in src/lib/portfolio/networth.ts (getAssetClassBreakdown) —
 * extracted 2026-09-24 so /portfolio/all and the broadened /portfolio/india can reuse the exact
 * same current-value logic instead of a second copy of it living here. This function is now just
 * the adapter from that shared, portfolio-shaped breakdown onto this screen's `networth.*` item
 * keys. Read-only: never writes the baseline table itself — the "Use live value" button
 * (useLiveNetWorthValueAction) is the explicit trigger that does, same pattern as
 * useLedgerValueAction above.
 */
const ASSET_CLASS_TO_NETWORTH_KEY: Record<string, string> = {
  usEquity: "networth.intlEquity",
  indianEquity: "networth.indianEquity",
  kabirPms: "networth.pms",
  nse: "networth.unlistedNse",
  mfEquity: "networth.mfEquity",
  mfDebt: "networth.mfDebt",
  mfHybrid: "networth.mfHybrid",
  mfCommodity: "networth.mfCommodity",
  epfNps: "networth.epfNps",
};

export async function getNetWorthActuals(): Promise<Record<string, NetWorthActual>> {
  const { getAssetClassBreakdown } = await import("@/lib/portfolio/networth");
  const rows = await getAssetClassBreakdown();
  const out: Record<string, NetWorthActual> = {};
  for (const r of rows) {
    const netWorthKey = ASSET_CLASS_TO_NETWORTH_KEY[r.key];
    if (netWorthKey && r.valueL != null) out[netWorthKey] = { valueL: r.valueL, asOf: r.asOf };
  }
  return out;
}


/**
 * Bitcoin and real estate as portfolio-visible rows — sourced from the same manual figures the
 * retirement Assets/Baseline screens edit (networth.bitcoin / networth.realEstate on
 * RetirementBaselineItem), not from a broker or price feed (neither exists for either class).
 * "Current value" here just means "the figure last saved on /retirement/assets", and asOf is
 * that save's lastReviewedAt, not a market price date. Read-only from the portfolio side:
 * /portfolio/all links back to /retirement/assets rather than offering its own edit control —
 * consistent with Portfolio staying bottoms-up/read-only and Retirement Assets being the one
 * editable surface for the manual tracker.
 */
export async function getManualTrackedAssets(): Promise<AssetClassRow[]> {
  let planId: string;
  try {
    planId = await getBaselinePlanId();
  } catch {
    return [];
  }
  const items = await prisma.retirementBaselineItem.findMany({
    where: { planId, key: { in: ["networth.bitcoin", "networth.realEstate"] } },
    select: { key: true, valueL: true, lastReviewedAt: true },
  });
  const byKey = new Map(items.map((i) => [i.key, i]));
  const row = (key: "bitcoin" | "realEstate", itemKey: string, label: string): AssetClassRow => {
    const item = byKey.get(itemKey);
    return {
      key, label, group: "manual", href: "/retirement/assets",
      valueL: item ? Number(item.valueL) : null,
      asOf: item ? item.lastReviewedAt.toISOString().slice(0, 10) : null,
    };
  };
  return [
    row("bitcoin", "networth.bitcoin", "BitCoin"),
    row("realEstate", "networth.realEstate", "Real estate (present value)"),
  ];
}
