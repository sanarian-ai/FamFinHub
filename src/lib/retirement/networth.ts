/**
 * Net worth by asset class — a parallel, tracked-only baseline section (group: "netWorth" in the
 * RetirementBaselineGroup enum). These items are deliberately NOT consumed by compute() or
 * itemsToBaseline(): the engine's Baseline shape and BASELINE_KEYS are untouched by this file.
 * This is a separate "where does everything sit" view the user wants in one place, even where a
 * class already has its own engine input under a different key (e.g. EPF/NPS also feeds the
 * plan's opening pool via BASELINE_KEYS' "epf") — the two are intentionally independent numbers.
 *
 * Five classes are live-wired to existing data providers (see baseline/data.ts getNetWorthActuals):
 * international equity (US portfolio), PMS (Kabir), mutual funds (CAMS), EPF + NPS (INDmoney,
 * value-only — no unit-level data exists for these two), and NSE's own listed shares (INDmoney,
 * real units — Sangeeth via Zerodha, Ria via Kotak Securities; NSE listed itself on BSE
 * 2026-09-24). Everything else is a manual figure the user updates directly, same explicit-save
 * UX as the rest of the baseline screen — a live-wired class is never forced: "Use live value" is
 * an explicit sync action, and the stored figure stays a manually editable number in between
 * syncs.
 *
 * Seeded once from the user's personal net-worth tracking sheet (Sep 2026 snapshot) via
 * scripts/retirement/seed-networth.ts; values from there are just a starting point, not kept in
 * sync with the sheet.
 */
export type NetWorthLiveSource = "usPortfolio" | "kabirPms" | "mutualFunds" | "epfNps" | "nse" | null;

export interface NetWorthClass {
  key: string;
  label: string;
  live: NetWorthLiveSource;
  sortOrder: number;
}

export const NETWORTH_CLASSES: NetWorthClass[] = [
  { key: "networth.mutualFunds", label: "Mutual funds", live: "mutualFunds", sortOrder: 0 },
  { key: "networth.indianEquity", label: "Indian direct equity", live: null, sortOrder: 1 },
  { key: "networth.unlistedNse", label: "NSE (National Stock Exchange of India)", live: "nse", sortOrder: 2 }, // relabeled 2026-09-24: NSE listed itself (BSE) that day, no longer unlisted
  { key: "networth.intlEquity", label: "International equity (US stocks)", live: "usPortfolio", sortOrder: 3 },
  { key: "networth.pms", label: "PMS (Kabir)", live: "kabirPms", sortOrder: 4 },
  { key: "networth.commodities", label: "Commodities (gold/silver)", live: null, sortOrder: 5 },
  { key: "networth.epfNps", label: "EPF + NPS", live: "epfNps", sortOrder: 6 },
  { key: "networth.fd", label: "Fixed deposits", live: null, sortOrder: 7 },
  { key: "networth.cash", label: "Cash", live: null, sortOrder: 8 },
  { key: "networth.realEstate", label: "Real estate (present value)", live: null, sortOrder: 9 },
  { key: "networth.futureGenerali", label: "Future Generali (policy value)", live: null, sortOrder: 10 },
  { key: "networth.esops", label: "ESOPs", live: null, sortOrder: 11 },
  { key: "networth.bitcoin", label: "BitCoin", live: null, sortOrder: 12 },
];

export const NETWORTH_KEYS: string[] = NETWORTH_CLASSES.map((c) => c.key);
