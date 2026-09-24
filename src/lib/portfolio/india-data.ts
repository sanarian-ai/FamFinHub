// Server-side loader for the India Portfolio screens, mirroring data.ts's shape (60s in-process
// memo) but scoped to India accounts via loadIndiaDataset.
//
// Also resolves India's account-key groupings by channel (Equity direct-demat / PMS / Mutual
// Funds) — this is the "blended-ledger XIRR combiner": callers pass channelAccounts.EQUITY (or
// .PMS, .MF, or .ALL for the blended view) as RunOpts.accounts into the same engine.run()/
// views.stockRows() used everywhere else, so a channel-scoped screen and the India rollup (step 3)
// are just different `accounts` filters over one Ctx, never a second code path.
//
// Unlike the US book's fixed BROKERS map in views.ts (2 static brokers -> 2 static key lists),
// India's account keys are broker-diverse and, for mutual funds, grow dynamically — one MF_FOLIO
// account per AMC/folio, added as new CAMS statements are ingested — so channel membership is
// resolved from the DB by broker on every load rather than hardcoded.
import type { PortfolioBroker } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildContext, buildLots, type Ctx, type Dataset, type LotBook } from "./engine";
import { loadIndiaDataset, INDIA_BROKERS } from "./india-load";

export const INDIA_CHANNEL_BROKERS = {
  ALL: INDIA_BROKERS,
  EQUITY: ["ZERODHA", "KOTAK_SECURITIES", "IIFL_DEMAT"] as PortfolioBroker[],
  PMS: ["KABIR_PMS", "KABIR_CAPITAL_VENTURES", "KABIR_FINANCIAL_VENTURES", "UNIFI_PMS"] as PortfolioBroker[],
  MF: ["MF_FOLIO"] as PortfolioBroker[],
} as const;
export type IndiaChannel = keyof typeof INDIA_CHANNEL_BROKERS;

export type HolderKey = "SANGEETH" | "RIA" | "HOUSEHOLD";
export type IndiaPortfolioData = {
  ds: Dataset; ctx: Ctx; book: LotBook; empty: boolean;
  channelAccounts: Record<IndiaChannel, string[]>;
  // Resolved from PortfolioAccount.holder ("Sangeeth" / "Ria" today) rather than hardcoded, same
  // reasoning as channelAccounts: Sangeeth's own MF folios aren't sourced yet (see the build brief's
  // open items) but will show up here automatically once they are, no code change needed.
  holderAccounts: Record<HolderKey, string[]>;
  // Accounts eligible for buildLots()/positions() — i.e. every India account EXCEPT the closed
  // pooled-vehicle accounts ingested in step 4 (KCV/KFV/Unifi BLN/Unifi BCAD20). Those four use a
  // "qty 1 = one contribution or withdrawal" synthetic-security encoding that's correct for
  // engine.run()'s dated cashflows (XIRR) but is NOT a real position lifecycle — FIFO-matching their
  // BUY/SELL events throws (an early full-value SELL against a single BUY lot is a real oversell,
  // not a bug) even for the two accounts where it happens not to throw, the resulting "lots" are
  // meaningless (e.g. "sold the ₹25L lot for ₹25K"). Every buildLots() call in this app MUST
  // intersect its `accounts` argument with this list first — reuses PortfolioAccount.isActive
  // (already false on all four, set at ingestion) rather than a second hardcoded exclude-list, so a
  // future closed/synthetic account is excluded automatically by the same flag.
  lotAccounts: string[];
  lotsError: string | null; // set when buildLots() rejected the trade history (e.g. an oversold lot from an
  // unmodeled CAMS transaction type such as a switch or reinvestment) — book falls back to empty rather than
  // crashing every India screen; XIRR/positions still work off ds/ctx, only FIFO lots/disposals are affected.
};

let memo: { at: number; v: IndiaPortfolioData } | null = null;
const TTL_MS = 60_000;

export async function getIndiaPortfolioData(): Promise<IndiaPortfolioData> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.v;
  const [ds, accs] = await Promise.all([
    loadIndiaDataset(prisma),
    prisma.portfolioAccount.findMany({ where: { broker: { in: INDIA_BROKERS } }, select: { key: true, broker: true, holder: true, isActive: true } }),
  ]);
  const channelAccounts = {} as Record<IndiaChannel, string[]>;
  for (const ch of Object.keys(INDIA_CHANNEL_BROKERS) as IndiaChannel[]) {
    const brokers = INDIA_CHANNEL_BROKERS[ch] as PortfolioBroker[];
    channelAccounts[ch] = accs.filter((a) => brokers.includes(a.broker)).map((a) => a.key);
  }
  const holderAccounts: Record<HolderKey, string[]> = {
    SANGEETH: accs.filter((a) => a.holder === "Sangeeth").map((a) => a.key),
    RIA: accs.filter((a) => a.holder === "Ria").map((a) => a.key),
    HOUSEHOLD: accs.map((a) => a.key),
  };
  const lotAccounts = accs.filter((a) => a.isActive).map((a) => a.key);
  const empty = ds.trades.length === 0 || Object.keys(ds.prices).length === 0;
  const ctx = buildContext(ds);
  let book: LotBook = { open: [], disposals: [] };
  let lotsError: string | null = null;
  if (!empty) {
    try { book = buildLots(ds, lotAccounts); } catch (e) { lotsError = e instanceof Error ? e.message : String(e); }
  }
  const v: IndiaPortfolioData = { ds, ctx, book, empty, channelAccounts, holderAccounts, lotAccounts, lotsError };
  memo = { at: Date.now(), v };
  return v;
}
