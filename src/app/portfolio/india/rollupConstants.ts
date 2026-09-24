// Constants for the India rollup (/portfolio/india Overview + Performance) — the blended view
// across every India channel (Equity + PMS + Mutual Funds), per
// india-pms-mf-portfolio-ux-proposal.md's "India rollup" design.
import type { HolderKey, IndiaChannel } from "@/lib/portfolio/india-data";

// Single benchmark for the blended book: "the closest single honest benchmark for a book that
// spans self-directed equity, multi-strategy PMS, and diversified MF" (design doc). Per-channel
// detail pages use their own benchmark sets (e.g. India Equity's Nifty 50 + 500 TRI).
export const INDIA_BENCHMARK = "NIFTY500TRI" as const;

export const HOLDER_LABEL: Record<HolderKey, string> = { SANGEETH: "Sangeeth", RIA: "Ria", HOUSEHOLD: "Household" };
export const HOLDER_ORDER: HolderKey[] = ["HOUSEHOLD", "SANGEETH", "RIA"];

export type OpenClosed = "OPEN" | "CLOSED" | "ALL";
export const OC_LABEL: Record<OpenClosed, string> = { ALL: "All", OPEN: "Currently held", CLOSED: "Fully exited" };

export const CHANNEL_LABEL: Record<IndiaChannel, string> = { ALL: "All channels", EQUITY: "Equity", PMS: "PMS", MF: "Mutual funds" };
export const CHANNEL_ORDER: Extract<IndiaChannel, "EQUITY" | "PMS" | "MF">[] = ["EQUITY", "PMS", "MF"];
