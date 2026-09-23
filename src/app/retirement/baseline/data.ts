/**
 * Server-side loader for the retirement baseline screen. Lives here (not in src/lib/retirement)
 * because it reads the ledger's own models (Category, Transaction) directly — outside the narrow
 * RetirementDb interface the portable, unit-tested engine/store/persist layer is built against.
 */
import { prisma } from "@/lib/prisma";

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
 * Live current values for the two net-worth-by-asset-class rows that have an existing data
 * provider (see src/lib/retirement/networth.ts NETWORTH_CLASSES): international equity from the
 * US portfolio engine, PMS from Kabir's snapshot+price query. Both already exist elsewhere in the
 * app (src/app/portfolio/us/holdings, src/app/portfolio/india) — this reuses them rather than
 * re-deriving a second source of truth. Read-only: never writes the baseline table itself: the
 * "Use live value" button (useLiveNetWorthValueAction) is the explicit trigger that does, same
 * pattern as useLedgerValueAction above.
 */
export async function getNetWorthActuals(): Promise<Record<string, NetWorthActual>> {
  const [intlEquity, pms] = await Promise.all([getIntlEquityActual(), getKabirPmsActual()]);
  const out: Record<string, NetWorthActual> = {};
  if (intlEquity != null) out["networth.intlEquity"] = intlEquity;
  if (pms != null) out["networth.pms"] = pms;
  return out;
}

async function getIntlEquityActual(): Promise<NetWorthActual | null> {
  try {
    const { getPortfolioData } = await import("@/lib/portfolio/data");
    const { positions } = await import("@/lib/portfolio/views");
    const { ctx, book, empty } = await getPortfolioData();
    if (empty) return null;
    const pos = positions(ctx, book);
    const fx = ctx.fx[ctx.fx.length - 1];
    const valueINR = pos.totalValue * fx;
    return { valueL: valueINR / 1e5, asOf: ctx.asof };
  } catch {
    return null;
  }
}

async function getKabirPmsActual(): Promise<NetWorthActual | null> {
  const account = await prisma.portfolioAccount.findUnique({ where: { key: "KABIR_PMS_RIA" } });
  if (!account) return null;
  const [snapshots, securities] = await Promise.all([
    prisma.positionSnapshot.findMany({
      where: { accountId: account.id }, orderBy: { asOf: "desc" },
      select: { securityId: true, asOf: true, qty: true },
    }),
    prisma.security.findMany({
      where: { transactions: { some: { accountId: account.id } } },
      select: { id: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
    }),
  ]);
  if (snapshots.length === 0) return null;
  const latestQty = new Map<string, number>();
  for (const s of snapshots) if (!latestQty.has(s.securityId)) latestQty.set(s.securityId, Number(s.qty));
  let totalValue = 0;
  let asOf: string | null = null;
  for (const sec of securities) {
    const qty = latestQty.get(sec.id) ?? 0;
    const price = sec.prices[0];
    if (qty > 0 && price?.close != null) {
      totalValue += qty * Number(price.close);
      const d = price.date.toISOString().slice(0, 10);
      if (asOf === null || d > asOf) asOf = d;
    }
  }
  return { valueL: totalValue / 1e5, asOf };
}
