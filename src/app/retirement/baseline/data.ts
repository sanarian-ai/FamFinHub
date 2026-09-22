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
