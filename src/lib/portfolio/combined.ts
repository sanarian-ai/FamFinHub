// Combines the US and India engine books into one household view — INR-normalized, no new engine.
//
// Why not one merged Ctx + one run() call: run()'s currency conversion (fxAt(i) = ctx.fx[i] when
// RunOpts.currency==="INR", else 1) applies ONE multiplier uniformly across every cash flow in a
// single run() call — it assumes the whole Ctx is natively one currency. India's Ctx has no fx table
// (INR-native already) and the US Ctx's fx table is USDINR; there's no way to ask a single run() call
// to convert only a SUBSET of its trades. So combining happens one level above run(), not by teaching
// buildContext()/run() to understand a mixed-currency Ctx (ruled out in the build brief: "no new
// engine").
//
// What this does instead: run() each book separately with its own correct currency handling (US with
// currency:"INR" so every USD flow is FX-converted to INR on its own trade date via the existing
// FxDaily-backed ctx.fx table; India already INR-native, no currency option needed), then merge the
// two already-correctly-anchored dated cash-flow streams (RunResult.cashflows, added to engine.ts for
// this) and run ONE xirr() call over the union. This is valid because xirr()'s bisection sums each
// {ms,v} entry's own present value independently — it doesn't need entries pre-netted by date, so two
// streams that each already carry their own correct V0/V1 boundary entries can simply be concatenated.
//
// Precondition this relies on: both books' Ctx.dates arrays must be identical (confirmed empirically —
// neither load.ts's nor india-load.ts's PriceDaily query is broker-filtered, so both loaders pull the
// SAME global price universe, including every benchmark symbol in both books) so that idxOn(dates, d)
// resolves the same d0/d1 boundary dates for both run() calls whenever they're given the same
// start/end strings — the merge below assumes usR.d0 === indiaR.d0 and usR.d1 === indiaR.d1 on that
// basis, not a fresh check on every call. Verified directly against live data (2026-09-25): both
// books' d0/d1 matched exactly, and legFromCashflows(book.cashflows, ...) reproduced that book's own
// run().pf leg byte-for-byte in isolation.
//
// Benchmark treatment (locked decision, india-portfolio-build-brief.md "Key decisions locked"):
// "Combined (India+US) IRR benchmark: 3 indices side by side (Nifty 50 TRI, S&P 500, QQQ) — no
// composite." Each index's leg is each book's OWN already-computed single-book replica, unchanged —
// India's flows replicated into Nifty 50 TRI, US's flows replicated into S&P 500/QQQ — not a new
// replica built from the merged flow list. Same "channel cut" pattern the India rollup already uses:
// P&L/value sum exactly to the total; IRR is each scope's own money-weighted rate, not decomposed.
import { legFromCashflows, run, xirr, type CF, type Ctx, type Leg, type RunResult } from "./engine";

// The India rollup's own blended book benchmarks against Nifty 500 TRI (the "closest single honest
// benchmark for a book spanning equity/PMS/MF" — see rollupConstants.ts). This combined household
// view is a different, explicitly-locked comparison: Nifty 50 TRI as the headline large-cap index
// alongside the US book's S&P 500/QQQ, not India's own broader blend benchmark.
export const COMBINED_INDIA_BENCHMARK = "NIFTY50TRI" as const;
export const US_BENCHMARKS = ["SPY", "QQQ"] as const;

export type CombinedRunResult = {
  d0: string; d1: string; days: number; annualised: boolean; hasData: boolean;
  V0: number; V1: number; net: number;
  us: RunResult; india: RunResult; all: Leg;
};

/** Runs both books over the same [start,end] window and merges them into one household Leg.
 * `indiaAccounts` should be the India rollup's full scope (getIndiaPortfolioData().channelAccounts.ALL
 * for Household, or a holder-filtered subset) — the US side has no equivalent account restriction
 * exposed here (always every US account), matching how /portfolio/us itself has no holder toggle. */
export function combinedRun(usCtx: Ctx, indiaCtx: Ctx, indiaAccounts: string[], start: string, end: string, opts: { series?: boolean } = {}): CombinedRunResult {
  const us = run(usCtx, start, end, { currency: "INR", benchmarks: US_BENCHMARKS, dividends: true, series: opts.series });
  const india = run(indiaCtx, start, end, { accounts: indiaAccounts, benchmarks: [COMBINED_INDIA_BENCHMARK], dividends: true, series: opts.series });
  const V0 = us.V0 + india.V0, V1 = us.V1 + india.V1, net = us.net + india.net;
  const d0ms = Date.parse(`${us.d0}T00:00:00Z`), d1ms = Date.parse(`${us.d1}T00:00:00Z`);
  const T = Math.max(1, d1ms - d0ms);
  const merged: CF[] = [...us.cashflows, ...india.cashflows];
  const all = legFromCashflows(merged, V0, d1ms, T);
  return {
    d0: us.d0, d1: us.d1, days: us.days, annualised: us.annualised, hasData: us.hasData && india.hasData,
    V0, V1, net, us, india, all,
  };
}

// Re-exported so callers (the /portfolio/all/performance page) don't need a second import from
// engine.ts just for the merged stream's own IRR, if they ever need it standalone.
export { xirr };
