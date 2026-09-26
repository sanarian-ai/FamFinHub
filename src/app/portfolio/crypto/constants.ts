// Crypto screen constants. Single account (CoinDCX, Sangeeth) — see crypto-load.ts's
// CRYPTO_BROKERS. Benchmarked against Nifty 50 TRI only (not the 2-index India Equity treatment):
// crypto is a satellite allocation, not a core-equity substitute, so one defensible opportunity-cost
// benchmark is enough — same "pick one" precedent as India PMS.
export const CRYPTO_BENCHMARKS = ["NIFTY50TRI"] as const;
export const BENCHMARK_LABEL: Record<string, string> = { NIFTY50TRI: "Nifty 50 TRI" };

export const SYMBOL_LABEL: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum" };
