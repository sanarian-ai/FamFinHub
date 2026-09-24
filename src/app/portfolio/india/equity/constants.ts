// India Equity screen constants. Direct-demat holdings only (Zerodha, Kotak Securities, IIFL) —
// the India PMS / Mutual Funds channels get their own screens in later steps (see
// india-portfolio-build-brief.md). Account keys are hardcoded here the same way the pre-existing
// /portfolio/india stub page hardcodes its ACCOUNT_KEYS: there are exactly 3 of these accounts and
// they don't grow the way MF folios do, unlike india-data.ts's DB-resolved channel membership.
export const EQUITY_HOLDER_GROUPS = {
  ALL: undefined,
  SANGEETH: ["ZERODHA_SANGEETH"],
  RIA: ["KOTAK_SECURITIES_RIA", "IIFL_DEMAT_RIA"],
} as const;
export type HolderKey = keyof typeof EQUITY_HOLDER_GROUPS;
export const accountsForHolder = (h: HolderKey) => (EQUITY_HOLDER_GROUPS[h] ? [...EQUITY_HOLDER_GROUPS[h]!] : undefined);

export const ACCOUNT_LABEL: Record<string, string> = {
  ZERODHA_SANGEETH: "Zerodha (Sangeeth)",
  KOTAK_SECURITIES_RIA: "Kotak Securities (Ria)",
  IIFL_DEMAT_RIA: "IIFL demat (Ria)",
};

// Benchmarked against both broad-market and broader-market Nifty TRI indices — see engine.ts's
// generalized RunOpts.benchmarks (step 2). No per-scheme/sector benchmark, matching the MF channel's
// planned approach (india-portfolio-build-brief.md).
export const EQUITY_BENCHMARKS = ["NIFTY50TRI", "NIFTY500TRI"] as const;
export const BENCHMARK_LABEL: Record<string, string> = { NIFTY50TRI: "Nifty 50 TRI", NIFTY500TRI: "Nifty 500 TRI" };
