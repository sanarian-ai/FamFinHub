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
 * Live current values for the net-worth-by-asset-class rows that have an existing data provider
 * (see src/lib/retirement/networth.ts NETWORTH_CLASSES): international equity from the US
 * portfolio engine, PMS from Kabir's snapshot+price query, mutual funds from the CAMS-ingested
 * MF_FOLIO accounts, EPF + NPS from the RETIREMENT_TRACKED accounts seeded via the INDmoney MCP
 * (value-only — see seed-aggregate-value.ts; no unit-level data exists for these two), NSE's own
 * listed shares from the ZERODHA/KOTAK_SECURITIES accounts, and Indian direct equity from the
 * IIFL_DEMAT account (both real units, seeded via seed-holdings.ts same as Kabir PMS). The first
 * three already exist elsewhere in the app (src/app/portfolio/us/holdings, src/app/portfolio/india,
 * src/app/portfolio/mf) — this reuses them rather than re-deriving a second source of truth.
 * Read-only: never writes the baseline table itself: the "Use live value" button
 * (useLiveNetWorthValueAction) is the explicit trigger that does, same pattern as
 * useLedgerValueAction above.
 */
export async function getNetWorthActuals(): Promise<Record<string, NetWorthActual>> {
  const [intlEquity, pms, mutualFunds, epfNps, nse, iifl] = await Promise.all([
    getIntlEquityActual(),
    getKabirPmsActual(),
    getMutualFundsActual(),
    getEpfNpsActual(),
    getNseActual(),
    getIiflActual(),
  ]);
  const out: Record<string, NetWorthActual> = {};
  if (intlEquity != null) out["networth.intlEquity"] = intlEquity;
  if (pms != null) out["networth.pms"] = pms;
  if (mutualFunds != null) out["networth.mutualFunds"] = mutualFunds;
  if (epfNps != null) out["networth.epfNps"] = epfNps;
  if (nse != null) out["networth.unlistedNse"] = nse;
  if (iifl != null) out["networth.indianEquity"] = iifl;
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


/**
 * Sum of current market value across every MF_FOLIO account (a mutual fund can span several
 * folios — see camsParser.ts header — so this is latest qty per (account, security) pair, summed,
 * not deduped to one row per security). Mirrors src/app/portfolio/mf/page.tsx's own aggregation.
 */
async function getMutualFundsActual(): Promise<NetWorthActual | null> {
  const accounts = await prisma.portfolioAccount.findMany({ where: { broker: "MF_FOLIO" }, select: { id: true } });
  if (accounts.length === 0) return null;
  const accountIds = accounts.map((a) => a.id);
  const snapshots = await prisma.positionSnapshot.findMany({
    where: { accountId: { in: accountIds } }, orderBy: { asOf: "desc" },
    select: { accountId: true, securityId: true, asOf: true, qty: true },
  });
  if (snapshots.length === 0) return null;
  const latestByPair = new Map<string, { securityId: string; qty: number }>();
  for (const s of snapshots) {
    const k = `${s.accountId}|${s.securityId}`;
    if (!latestByPair.has(k)) latestByPair.set(k, { securityId: s.securityId, qty: Number(s.qty) });
  }
  const securityIds = [...new Set([...latestByPair.values()].map((s) => s.securityId))];
  const securities = await prisma.security.findMany({
    where: { id: { in: securityIds } },
    select: { id: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
  });
  const priceById = new Map(securities.map((s) => [s.id, s.prices[0]]));
  let totalValue = 0;
  let asOf: string | null = null;
  for (const { securityId, qty } of latestByPair.values()) {
    const price = priceById.get(securityId);
    if (qty > 0 && price?.close != null) {
      totalValue += qty * Number(price.close);
      const d = price.date.toISOString().slice(0, 10);
      if (asOf === null || d > asOf) asOf = d;
    }
  }
  return { valueL: totalValue / 1e5, asOf };
}


/**
 * Sum of current value across every RETIREMENT_TRACKED account (one per family member; each has a
 * single AGGREGATE_VALUE security with qty fixed at 1 and PriceDaily.close carrying the whole EPF
 * + NPS total for that person). Seeded via seed-aggregate-value.ts from the INDmoney MCP — no
 * unit-level or per-broker data exists for EPF/NPS, confirmed against two separate INDmoney
 * endpoints (2026-09-24), so this is intentionally a coarser value-only sync than the other three
 * live classes.
 */
async function getEpfNpsActual(): Promise<NetWorthActual | null> {
  const accounts = await prisma.portfolioAccount.findMany({ where: { broker: "RETIREMENT_TRACKED" }, select: { id: true } });
  if (accounts.length === 0) return null;
  const accountIds = accounts.map((a) => a.id);
  const snapshots = await prisma.positionSnapshot.findMany({
    where: { accountId: { in: accountIds } }, orderBy: { asOf: "desc" },
    select: { accountId: true, securityId: true, asOf: true, qty: true },
  });
  if (snapshots.length === 0) return null;
  const latestByPair = new Map<string, { securityId: string; qty: number }>();
  for (const s of snapshots) {
    const k = `${s.accountId}|${s.securityId}`;
    if (!latestByPair.has(k)) latestByPair.set(k, { securityId: s.securityId, qty: Number(s.qty) });
  }
  const securityIds = [...new Set([...latestByPair.values()].map((s) => s.securityId))];
  const securities = await prisma.security.findMany({
    where: { id: { in: securityIds } },
    select: { id: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
  });
  const priceById = new Map(securities.map((s) => [s.id, s.prices[0]]));
  let totalValue = 0;
  let asOf: string | null = null;
  for (const { securityId, qty } of latestByPair.values()) {
    const price = priceById.get(securityId);
    if (qty > 0 && price?.close != null) {
      totalValue += qty * Number(price.close);
      const d = price.date.toISOString().slice(0, 10);
      if (asOf === null || d > asOf) asOf = d;
    }
  }
  return { valueL: totalValue / 1e5, asOf };
}


/**
 * Sum of current market value across NSE's own listed shares — Sangeeth's Zerodha holding plus
 * Ria's Kotak Securities holding (both hold only this one security today; the query is written
 * generically by broker in case either account picks up other holdings later). Same
 * latest-qty-per-(account,security) shape as getMutualFundsActual. The security's price is seeded
 * manually via INDmoney (seed-holdings.ts) until Yahoo Finance indexes this brand-new listing —
 * see priceFeed.ts / prices/refresh route, which is already wired for it (BSE market, .BO
 * suffix) and will take over silently once Yahoo has it.
 */
async function getNseActual(): Promise<NetWorthActual | null> {
  const accounts = await prisma.portfolioAccount.findMany({ where: { broker: { in: ["ZERODHA", "KOTAK_SECURITIES"] } }, select: { id: true } });
  if (accounts.length === 0) return null;
  const accountIds = accounts.map((a) => a.id);
  const snapshots = await prisma.positionSnapshot.findMany({
    where: { accountId: { in: accountIds } }, orderBy: { asOf: "desc" },
    select: { accountId: true, securityId: true, asOf: true, qty: true },
  });
  if (snapshots.length === 0) return null;
  const latestByPair = new Map<string, { securityId: string; qty: number }>();
  for (const s of snapshots) {
    const k = `${s.accountId}|${s.securityId}`;
    if (!latestByPair.has(k)) latestByPair.set(k, { securityId: s.securityId, qty: Number(s.qty) });
  }
  const securityIds = [...new Set([...latestByPair.values()].map((s) => s.securityId))];
  const securities = await prisma.security.findMany({
    where: { id: { in: securityIds } },
    select: { id: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
  });
  const priceById = new Map(securities.map((s) => [s.id, s.prices[0]]));
  let totalValue = 0;
  let asOf: string | null = null;
  for (const { securityId, qty } of latestByPair.values()) {
    const price = priceById.get(securityId);
    if (qty > 0 && price?.close != null) {
      totalValue += qty * Number(price.close);
      const d = price.date.toISOString().slice(0, 10);
      if (asOf === null || d > asOf) asOf = d;
    }
  }
  return { valueL: totalValue / 1e5, asOf };
}


/**
 * Sum of current market value across the IIFL_DEMAT account (Ria's India Infoline demat, 24
 * holdings, real units seeded via seed-holdings.ts from the INDmoney MCP). Distinct from PMS
 * (Kabir/Nuvama-custodied) despite both being Ria's Indian equity — kept as separate accounts so
 * the two stay easy to tell apart, per the original ask when this was first scoped.
 */
async function getIiflActual(): Promise<NetWorthActual | null> {
  const account = await prisma.portfolioAccount.findUnique({ where: { key: "IIFL_DEMAT_RIA" } });
  if (!account) return null;
  const snapshots = await prisma.positionSnapshot.findMany({
    where: { accountId: account.id }, orderBy: { asOf: "desc" },
    select: { securityId: true, asOf: true, qty: true },
  });
  if (snapshots.length === 0) return null;
  const latestQty = new Map<string, number>();
  for (const s of snapshots) if (!latestQty.has(s.securityId)) latestQty.set(s.securityId, Number(s.qty));
  const securities = await prisma.security.findMany({
    where: { id: { in: [...latestQty.keys()] } },
    select: { id: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
  });
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
