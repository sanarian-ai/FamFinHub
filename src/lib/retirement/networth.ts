/**
 * Net worth by asset class — a parallel, tracked-only baseline section (group: "netWorth" in the
 * RetirementBaselineGroup enum). These items are deliberately NOT consumed by compute() or
 * itemsToBaseline(): the engine's Baseline shape and BASELINE_KEYS are untouched by this file.
 * This is a separate "where does everything sit" view the user wants in one place, even where a
 * class already has its own engine input under a different key (e.g. EPF/NPS also feeds the
 * plan's opening pool via BASELINE_KEYS' "epf") — the two are intentionally independent numbers.
 *
 * Nine classes are live-wired to existing data providers (see baseline/data.ts getNetWorthActuals):
 * international equity (US portfolio), PMS (Kabir), mutual funds — split 4 ways by SEBI scheme
 * category (CAMS positions, categorized by fund name onto Security.mfCategory: Equity/Debt/
 * Hybrid/Commodity — arbitrage, equity savings, balanced advantage and multi-asset funds are
 * HYBRID, genuinely mixed exposure, not forced into Equity or Debt), EPF + NPS (INDmoney,
 * value-only — no unit-level data exists for these two), NSE's own listed shares (INDmoney, real
 * units — Sangeeth via Zerodha, Ria via Kotak Securities; NSE listed itself on BSE 2026-09-24),
 * and Indian direct equity (INDmoney, real units — Ria's IIFL/India Infoline demat, 24 holdings,
 * distinct from the Kabir PMS book which is Nuvama-custodied). Everything else is a manual figure
 * the user updates directly, same explicit-save UX as the rest of the baseline screen — a
 * live-wired class is never forced: "Use live value" is an explicit sync action, and the stored
 * figure stays a manually editable number in between syncs.
 *
 * networth.commodities ("Commodities (gold/silver)", a manual figure) was removed 2026-09-24: it
 * was the same Edelweiss Gold and Silver ETF FoF now tracked live under networth.mfCommodity
 * (₹50.50L manual vs ₹49.67L live — same holding, confirmed via the original seed script's own
 * comment: "Commodities total ... (Gold/Silver ETF)"), so it was a straight double-count.
 *
 * Seeded once from the user's personal net-worth tracking sheet (Sep 2026 snapshot) via
 * scripts/retirement/seed-networth.ts; values from there are just a starting point, not kept in
 * sync with the sheet.
 */
export type NetWorthLiveSource = "usPortfolio" | "kabirPms" | "mfEquity" | "mfDebt" | "mfHybrid" | "mfCommodity" | "epfNps" | "nse" | "iifl" | null;

export interface NetWorthClass {
  key: string;
  label: string;
  live: NetWorthLiveSource;
  sortOrder: number;
}

export const NETWORTH_CLASSES: NetWorthClass[] = [
  { key: "networth.mfEquity", label: "Mutual funds — Equity", live: "mfEquity", sortOrder: 0 },
  { key: "networth.mfDebt", label: "Mutual funds — Debt", live: "mfDebt", sortOrder: 1 },
  { key: "networth.mfHybrid", label: "Mutual funds — Hybrid", live: "mfHybrid", sortOrder: 2 },
  { key: "networth.mfCommodity", label: "Mutual funds — Commodity", live: "mfCommodity", sortOrder: 3 },
  { key: "networth.indianEquity", label: "Indian direct equity", live: "iifl", sortOrder: 4 },
  { key: "networth.unlistedNse", label: "NSE (National Stock Exchange of India)", live: "nse", sortOrder: 5 }, // relabeled 2026-09-24: NSE listed itself (BSE) that day, no longer unlisted
  { key: "networth.intlEquity", label: "International equity (US stocks)", live: "usPortfolio", sortOrder: 6 },
  { key: "networth.pms", label: "PMS (Kabir)", live: "kabirPms", sortOrder: 7 },
  { key: "networth.epfNps", label: "EPF + NPS", live: "epfNps", sortOrder: 8 },
  { key: "networth.fd", label: "Fixed deposits", live: null, sortOrder: 9 },
  { key: "networth.cash", label: "Cash", live: null, sortOrder: 10 },
  { key: "networth.realEstate", label: "Real estate (present value)", live: null, sortOrder: 11 },
  { key: "networth.esops", label: "ESOPs", live: null, sortOrder: 12 },
  { key: "networth.bitcoin", label: "BitCoin", live: null, sortOrder: 13 },
];

export const NETWORTH_KEYS: string[] = NETWORTH_CLASSES.map((c) => c.key);
