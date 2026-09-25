// India Mutual Funds screen constants. All 24 CAMS-ingested securities live in MF_FOLIO-broker
// accounts, all under Ria's PAN today (Sangeeth's own MF folios aren't sourced yet — see the build
// brief's open items) — so unlike India Equity there's no holder toggle here, same reasoning as PMS.
export const MF_BENCHMARKS = ["NIFTY50TRI", "NIFMC150TRI", "NIFSC250TRI", "NIFTY500TRI"] as const;
export const BENCHMARK_LABEL: Record<string, string> = {
  NIFTY50TRI: "Nifty 50 TRI",
  NIFMC150TRI: "Nifty Midcap 150 TRI",
  NIFSC250TRI: "Nifty Smallcap 250 TRI",
  NIFTY500TRI: "Nifty 500 TRI",
};
// Per the MF proposal's locked decision: aggregate-channel benchmarking only, four indices side by
// side — no per-scheme category classification, no composite. Security.mfCategory (EQUITY/DEBT/
// HYBRID/COMMODITY) is shown for identification only (e.g. on Holdings), never used to pick a
// scheme-specific benchmark.

export const CATEGORY_LABEL: Record<string, string> = {
  EQUITY: "Equity",
  DEBT: "Debt",
  HYBRID: "Hybrid",
  COMMODITY: "Commodity",
};
