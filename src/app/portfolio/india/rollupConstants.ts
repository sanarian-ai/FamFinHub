// Constants for the India rollup (/portfolio/india Overview + Performance) — the blended view
// across every India channel (Equity + PMS + Mutual Funds), per
// india-pms-mf-portfolio-ux-proposal.md's "India rollup" design.
import type { HolderKey, IndiaChannel } from "@/lib/portfolio/india-data";

// Single benchmark for the blended book: "the closest single honest benchmark for a book that
// spans self-directed equity, multi-strategy PMS, and diversified MF" (design doc). Per-channel
// detail pages use their own benchmark sets (e.g. India Equity's Nifty 50 + 500 TRI). Still the
// benchmark used for the rollup Performance page's own value-vs-benchmark chart line (single-line
// by design, see RollupValueChart) even though the summary tiles below now show the full set.
export const INDIA_BENCHMARK = "NIFTY500TRI" as const;

// Full India benchmark set for the rollup Performance page's summary tiles/table — added
// 2026-09-26 so the tile grid gives Nifty 50, Nifty 500, Midcap 150, and Smallcap 250 equal
// prominence with the blended IRR, alpha demoted to a caption within each tile. All four are
// already ingested (scripts/portfolio/benchmarks/seed.ts).
export const INDIA_BENCHMARKS = ["NIFTY50TRI", "NIFTY500TRI", "NIFMC150TRI", "NIFSC250TRI"] as const;
export const INDIA_BENCHMARK_LABEL: Record<string, string> = {
  NIFTY50TRI: "Nifty 50 TRI",
  NIFTY500TRI: "Nifty 500 TRI",
  NIFMC150TRI: "Nifty Midcap 150 TRI",
  NIFSC250TRI: "Nifty Smallcap 250 TRI",
};

export const HOLDER_LABEL: Record<HolderKey, string> = { SANGEETH: "Sangeeth", RIA: "Ria", HOUSEHOLD: "Household" };
export const HOLDER_ORDER: HolderKey[] = ["HOUSEHOLD", "SANGEETH", "RIA"];

export type OpenClosed = "OPEN" | "CLOSED" | "ALL";
export const OC_LABEL: Record<OpenClosed, string> = { ALL: "All", OPEN: "Currently held", CLOSED: "Fully exited" };

export const CHANNEL_LABEL: Record<IndiaChannel, string> = { ALL: "All channels", EQUITY: "Equity", PMS: "PMS", MF: "Mutual funds" };
export const CHANNEL_ORDER: Extract<IndiaChannel, "EQUITY" | "PMS" | "MF">[] = ["EQUITY", "PMS", "MF"];
