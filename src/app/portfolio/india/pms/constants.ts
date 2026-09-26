// India PMS screen constants. Single channel, single holder (Ria) today — every PMS account,
// live or closed, belongs to her — so unlike India Equity there's no holder toggle here.
export const PMS_BENCHMARK = "NIFTY500TRI" as const;
export const PMS_BENCHMARK_LABEL = "Nifty 500 TRI";
// Per the build brief's scope decision: no PMS-specific benchmark was ever locked in (the docs
// flagged "S&P BSE 500 TRI or whichever Kabir uses" as unconfirmed, never resolved) and BSE 500
// TRI was dropped from scope entirely. Nifty 500 TRI — already sourced, already the India rollup's
// single benchmark — is the documented likely substitute given Kabir's multi-cap mandate. Still
// the benchmark used for the Performance page's own chart line (single-line by design, see
// RollupValueChart) even though the summary tiles below now show the fuller set.

// Fuller benchmark set for the Performance page's summary tiles/table, added 2026-09-26 — Midcap
// 150 and Smallcap 250 TRI alongside Nifty 500 TRI, since Kabir's mandate runs across the cap
// spectrum, not just multi-cap-to-large.
export const PMS_BENCHMARKS = ["NIFTY500TRI", "NIFMC150TRI", "NIFSC250TRI"] as const;
export const PMS_BENCHMARK_LABELS: Record<string, string> = {
  NIFTY500TRI: "Nifty 500 TRI",
  NIFMC150TRI: "Nifty Midcap 150 TRI",
  NIFSC250TRI: "Nifty Smallcap 250 TRI",
};
