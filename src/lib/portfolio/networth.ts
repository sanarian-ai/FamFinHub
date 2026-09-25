import { prisma } from "@/lib/prisma";
import type { PortfolioBroker } from "@prisma/client";

/**
 * The cross-asset "what's it worth right now" aggregator — one query per tracked asset class,
 * shared by every screen that needs a current value rather than a full engine-backed view:
 * /portfolio/all (the All Assets dashboard), the broadened /portfolio/india (Kabir PMS + IIFL +
 * NSE holdings), and src/app/retirement/baseline/data.ts's getNetWorthActuals() (the "Use live
 * value" sync on the retirement baseline/assets screens).
 *
 * Extracted 2026-09-24 from what had been six near-identical private functions living inside
 * retirement/baseline/data.ts — same queries, same shape, just no longer retirement-specific and
 * no longer duplicated wherever a portfolio screen needed a class total. Nothing here writes
 * anything; every function is a read-only current-value lookup.
 */
export type AssetClassActual = { valueL: number; asOf: string | null };

export async function getUsEquityActual(): Promise<AssetClassActual | null> {
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

/**
 * Sum of current market value across a single-account, snapshot+price-quoted holding — the shape
 * shared by Kabir PMS and IIFL (both real-unit demat accounts with no lots/IRR engine behind
 * them, same minimal treatment as /portfolio/india — see that page's own header comment).
 */
async function getSingleAccountActual(accountKey: string): Promise<AssetClassActual | null> {
  const account = await prisma.portfolioAccount.findUnique({ where: { key: accountKey } });
  if (!account) return null;
  const snapshots = await prisma.positionSnapshot.findMany({
    where: { accountId: account.id }, orderBy: { asOf: "desc" },
    select: { securityId: true, asOf: true, qty: true },
  });
  if (snapshots.length === 0) return null;
  const latestQty = new Map<string, number>();
  for (const s of snapshots) if (!latestQty.has(s.securityId)) latestQty.set(s.securityId, Number(s.qty));
  // Securities are looked up by the snapshot's own securityId, not via a PortfolioTransaction
  // relation: Kabir PMS has transaction history behind its snapshots, but a real-unit demat seeded
  // straight from the INDmoney MCP (IIFL, and getMultiAccountActual's NSE accounts below) has
  // snapshots only, no PortfolioTransaction rows — a transactions-based join silently returns zero
  // securities for those. Snapshot-derived IDs work for both cases.
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

export async function getKabirPmsActual(): Promise<AssetClassActual | null> {
  return getSingleAccountActual("KABIR_PMS_RIA");
}

/**
 * Sum of current market value across the IIFL_DEMAT account (Ria's India Infoline demat, 24
 * holdings, real units seeded via seed-holdings.ts from the INDmoney MCP). Distinct from PMS
 * (Kabir/Nuvama-custodied) despite both being Ria's Indian equity — kept as separate accounts so
 * the two stay easy to tell apart, per the original ask when this was first scoped.
 */
export async function getIiflActual(): Promise<AssetClassActual | null> {
  return getSingleAccountActual("IIFL_DEMAT_RIA");
}

/**
 * Sum of current market value across every account holding a given broker set, latest qty per
 * (account, security) pair — the shape shared by NSE's own listed shares (Zerodha + Kotak
 * Securities, one account per holder) and EPF/NPS (one RETIREMENT_TRACKED account per holder).
 */
async function getMultiAccountActual(brokers: PortfolioBroker[]): Promise<AssetClassActual | null> {
  const accounts = await prisma.portfolioAccount.findMany({ where: { broker: { in: brokers } }, select: { id: true } });
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
 * NSE's own listed shares — Sangeeth's Zerodha holding plus Ria's Kotak Securities holding (both
 * hold only this one security today; written generically by broker in case either account picks
 * up other holdings later). The security's price is seeded manually via INDmoney until Yahoo
 * Finance indexes this brand-new listing — see priceFeed.ts / prices/refresh route, which is
 * already wired for it (BSE market, .BO suffix) and will take over silently once Yahoo has it.
 */
export async function getNseActual(): Promise<AssetClassActual | null> {
  return getMultiAccountActual(["ZERODHA", "KOTAK_SECURITIES"]);
}

/**
 * Sum of current value across every RETIREMENT_TRACKED account (one per family member; each has a
 * single AGGREGATE_VALUE security with qty fixed at 1 and PriceDaily.close carrying the whole EPF
 * + NPS total for that person). Seeded via seed-aggregate-value.ts from the INDmoney MCP — no
 * unit-level or per-broker data exists for EPF/NPS, so this is intentionally a coarser value-only
 * sync than the other classes here.
 */
export async function getEpfNpsActual(): Promise<AssetClassActual | null> {
  return getMultiAccountActual(["RETIREMENT_TRACKED"]);
}

/**
 * Sum of current market value across every MF_FOLIO account (a mutual fund can span several
 * folios — see camsParser.ts header — so this is latest qty per (account, security) pair, summed,
 * not deduped to one row per security — mirrors src/app/portfolio/mf/page.tsx's own aggregation),
 * split 4 ways by each security's Security.mfCategory (SEBI scheme category, read off the fund
 * name at classification time). A fund with no category set would silently vanish from all four
 * totals rather than one of them, so this throws instead — safer than a quiet undercount; every
 * MF_FOLIO-held security was categorized 2026-09-24 and any newly CAMS-ingested fund needs the
 * same before its value shows up anywhere here.
 */
export async function getMutualFundsByCategory(): Promise<Record<"EQUITY" | "DEBT" | "HYBRID" | "COMMODITY", AssetClassActual | null>> {
  const empty = { EQUITY: null, DEBT: null, HYBRID: null, COMMODITY: null } as const;
  const accounts = await prisma.portfolioAccount.findMany({ where: { broker: "MF_FOLIO" }, select: { id: true } });
  if (accounts.length === 0) return { ...empty };
  const accountIds = accounts.map((a) => a.id);
  const snapshots = await prisma.positionSnapshot.findMany({
    where: { accountId: { in: accountIds } }, orderBy: { asOf: "desc" },
    select: { accountId: true, securityId: true, asOf: true, qty: true },
  });
  if (snapshots.length === 0) return { ...empty };
  const latestByPair = new Map<string, { securityId: string; qty: number }>();
  for (const s of snapshots) {
    const k = `${s.accountId}|${s.securityId}`;
    if (!latestByPair.has(k)) latestByPair.set(k, { securityId: s.securityId, qty: Number(s.qty) });
  }
  const securityIds = [...new Set([...latestByPair.values()].map((s) => s.securityId))];
  const securities = await prisma.security.findMany({
    where: { id: { in: securityIds } },
    select: { id: true, mfCategory: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
  });
  const secById = new Map(securities.map((s) => [s.id, s]));
  const totals: Record<string, { value: number; asOf: string | null }> = {
    EQUITY: { value: 0, asOf: null }, DEBT: { value: 0, asOf: null }, HYBRID: { value: 0, asOf: null }, COMMODITY: { value: 0, asOf: null },
  };
  for (const { securityId, qty } of latestByPair.values()) {
    if (qty <= 0) continue;
    const sec = secById.get(securityId);
    const price = sec?.prices[0];
    if (!sec || price?.close == null) continue;
    if (!sec.mfCategory) throw new Error(`Security ${securityId} is MF_FOLIO-held but has no mfCategory set — classify it before it can appear in the net-worth split.`);
    const bucket = totals[sec.mfCategory];
    bucket.value += qty * Number(price.close);
    const d = price.date.toISOString().slice(0, 10);
    if (bucket.asOf === null || d > bucket.asOf) bucket.asOf = d;
  }
  const out: Record<string, AssetClassActual | null> = {};
  for (const [cat, t] of Object.entries(totals)) out[cat] = t.value > 0 ? { valueL: t.value / 1e5, asOf: t.asOf } : null;
  return out as Record<"EQUITY" | "DEBT" | "HYBRID" | "COMMODITY", AssetClassActual | null>;
}

export type AssetClassKey =
  | "usEquity" | "indianEquity" | "kabirPms" | "nse"
  | "mfEquity" | "mfDebt" | "mfHybrid" | "mfCommodity" | "epfNps"
  | "bitcoin" | "realEstate";

/** "manual" = no broker/price feed at all — bitcoin and real estate, sourced from the retirement
 *  Assets screen's own manual figures rather than a query in this file. See
 *  retirement/baseline/data.ts's getManualTrackedAssets(), which returns AssetClassRow-shaped
 *  rows for those two so /portfolio/all can fold them into the same table. */
export type AssetClassGroup = "equity" | "fund" | "retirement" | "manual";

export interface AssetClassRow {
  key: AssetClassKey;
  label: string;
  group: AssetClassGroup;
  /** Where this class's own detail page lives, or null when there isn't one (EPF/NPS has no
   *  unit-level portfolio page — it only shows up on the retirement baseline/assets screens). */
  href: string | null;
  valueL: number | null;
  asOf: string | null;
}

/**
 * All nine live-tracked asset classes in one call, US equity first (the intended /portfolio/all
 * landing order — see PortfolioSwitcher's "All" tab and the page it fronts), then India-related
 * classes. This is the single source both /portfolio/all and the broadened /portfolio/india's
 * "everything" total draw from, and what retirement/baseline/data.ts's getNetWorthActuals() now
 * maps onto its own `networth.*` item keys instead of re-deriving these totals itself.
 */
export async function getAssetClassBreakdown(): Promise<AssetClassRow[]> {
  const [usEquity, kabirPms, iifl, nse, mfByCategory, epfNps] = await Promise.all([
    getUsEquityActual(), getKabirPmsActual(), getIiflActual(), getNseActual(), getMutualFundsByCategory(), getEpfNpsActual(),
  ]);
  const row = (key: AssetClassKey, label: string, group: AssetClassGroup, href: string | null, a: AssetClassActual | null): AssetClassRow => ({
    key, label, group, href, valueL: a?.valueL ?? null, asOf: a?.asOf ?? null,
  });
  return [
    row("usEquity", "US equity", "equity", "/portfolio/us", usEquity),
    row("indianEquity", "Indian direct equity (IIFL)", "equity", "/portfolio/india/equity", iifl),
    row("kabirPms", "PMS (Kabir)", "equity", "/portfolio/india/pms", kabirPms),
    row("nse", "NSE's own listed shares", "equity", "/portfolio/india", nse),
    row("mfEquity", "Mutual funds — Equity", "fund", "/portfolio/india/mf", mfByCategory.EQUITY),
    row("mfDebt", "Mutual funds — Debt", "fund", "/portfolio/india/mf", mfByCategory.DEBT),
    row("mfHybrid", "Mutual funds — Hybrid", "fund", "/portfolio/india/mf", mfByCategory.HYBRID),
    row("mfCommodity", "Mutual funds — Commodity", "fund", "/portfolio/india/mf", mfByCategory.COMMODITY),
    row("epfNps", "EPF + NPS", "retirement", null, epfNps),
  ];
}
