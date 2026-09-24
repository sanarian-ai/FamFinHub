// India PMS screen constants. Single channel, single holder (Ria) today — every PMS account,
// live or closed, belongs to her — so unlike India Equity there's no holder toggle here.
export const PMS_BENCHMARK = "NIFTY500TRI" as const;
export const PMS_BENCHMARK_LABEL = "Nifty 500 TRI";
// Per the build brief's scope decision: no PMS-specific benchmark was ever locked in (the docs
// flagged "S&P BSE 500 TRI or whichever Kabir uses" as unconfirmed, never resolved) and BSE 500
// TRI was dropped from scope entirely. Nifty 500 TRI — already sourced, already the India rollup's
// single benchmark — is the documented likely substitute given Kabir's multi-cap mandate.
