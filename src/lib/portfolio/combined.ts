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
// this).
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
// The merged household `all` Leg: run() over ONE xirr() call over the raw concatenation of the
// three books' own cashflows. This is valid for `irr` (xirr()'s bisection sums each {ms,v} entry's
// own present value independently, so it doesn't care about entry order or how many boundary entries
// there are). It is NOT valid for `ret`/`moic` (used for periods under MIN_ANNUALISE_DAYS, e.g. "1M")
// — legFromCashflows() is a Modified-Dietz calc that assumes ONE self-contained stream: its first
// entry is the known startV boundary (skipped from the interior loop) and its LAST entry is the
// terminal value. Concatenating three already-bounded streams broke that contract: each book's own
// -V0/+V1 boundary entries landed mid-array and got misread as ordinary interior cash flows, and the
// "terminal value" ended up being just the LAST book's own ending value, not the true combined V1.
// Bug found 2026-09-26: "1M All Assets Return" showed -38.7% against a true +2.5%, traced to exactly
// this. Fixed below by stripping each book's own boundary entries and splicing only the genuine
// interior flows together under ONE true combined -V0/+V1 pair (`interiorOf`/`merged`).
//
// Benchmark treatment — changed 2026-09-26, reversing the prior locked decision (india-portfolio-
// build-brief.md "Key decisions locked": "Combined (India+US) IRR benchmark: 3 indices side by side
// (Nifty 50 TRI, S&P 500, QQQ)" via "each book's OWN already-computed single-book replica"). That
// produced a scope mismatch: alpha compared the WHOLE household's IRR against a benchmark replica
// built from only ONE book's cash flows (e.g. All Assets IRR minus what India's money alone would
// have made in Nifty), which doesn't answer "would the whole portfolio have done better in this
// index" for any real counterfactual. `allBench`/`allBenchSeries` below replicate the FULL merged
// household cash-flow stream — the same `interior` list the fixed `all` Leg uses — into each of the
// 3 indices, so the tiles/table/chart on /portfolio/all/performance now show "if every rupee/dollar
// had gone into this index instead" and alpha is scope-matched against the real All Assets IRR.
import { DEFAULT_WHT, idxOn, legFromCashflows, run, xirr, type CF, type Ctx, type Leg, type RunResult } from "./engine";

// The India rollup's own blended book benchmarks against Nifty 500 TRI (the "closest single honest
// benchmark for a book spanning equity/PMS/MF" — see rollupConstants.ts). This combined household
// view is a different, explicitly-locked comparison: Nifty 50 TRI as the headline large-cap index
// alongside the US book's S&P 500/QQQ, not India's own broader blend benchmark.
export const COMBINED_INDIA_BENCHMARK = "NIFTY50TRI" as const;
export const US_BENCHMARKS = ["SPY", "QQQ"] as const;

export type CombinedRunResult = {
  d0: string; d1: string; days: number; annualised: boolean; hasData: boolean;
  V0: number; V1: number; net: number;
  us: RunResult; india: RunResult; crypto?: RunResult; all: Leg;
  /** Whole-household replica per index — see the header comment above. Keyed by symbol
   * (COMBINED_INDIA_BENCHMARK/"NIFTY50TRI", "SPY", "QQQ"). */
  allBench: Record<string, Leg>;
  /** Day-by-day whole-household replica value per index, aligned index-for-index with
   * `us.series`/`india.series` (same dates, same length) — null unless opts.series was requested. */
  allBenchSeries: Record<string, number[]> | null;
};

/** Runs each book over the same [start,end] window and merges them into one household Leg.
 * `indiaAccounts` should be the India rollup's full scope (getIndiaPortfolioData().channelAccounts.ALL
 * for Household, or a holder-filtered subset) — the US side has no equivalent account restriction
 * exposed here (always every US account), matching how /portfolio/us itself has no holder toggle.
 *
 * `cryptoCtx` is optional and additive (added 2026-09-26 when Bitcoin/Ethereum moved to an
 * engine-backed book — see crypto-data.ts) — existing call sites that omit it are unaffected, same
 * "generalize, keep back-compat" pattern engine.ts's run() used for its benchmarks param. Crypto
 * benchmarks against the same Nifty 50 TRI as the India leg (COMBINED_INDIA_BENCHMARK) rather than a
 * 3rd headline index — it's INR-native already (no currency:"INR" needed) and its Ctx.dates draws
 * from the same unfiltered global PriceDaily query as US/India (see crypto-load.ts), satisfying the
 * same d0/d1-alignment precondition documented above. */
// The 3 locked indices, each tagged with whether it's USD-denominated (needs converting from the
// merged stream's native INR via the daily USDINR rate before pricing) or already INR-native.
const HOUSEHOLD_BENCHMARKS: { symbol: string; isUSD: boolean }[] = [
  { symbol: COMBINED_INDIA_BENCHMARK, isUSD: false },
  { symbol: "SPY", isUSD: true },
  { symbol: "QQQ", isUSD: true },
];

/** Replicates the household's own INTERIOR cash flows (already boundary-stripped, INR, chronological
 * order not required) into a single benchmark `symbol` — the same "buy notional units at each flow's
 * date, value at period end" mechanic run() uses internally for its own per-Ctx benchmark legs (see
 * engine.ts's `bu[b]`/`cfs[b]`), generalized to an externally-merged, multi-book event list. `isUSD`
 * converts each INR flow to USD via `fx` before pricing it in a USD-denominated index (SPY/QQQ) —
 * Nifty needs no conversion. `dates`/`px`/`fx`/`div` are read from the US Ctx: it's the only one of
 * the three books with a real daily USDINR series, and — per this file's precondition that all three
 * Ctx's pull the same unfiltered global PriceDaily query — its `px`/`div` tables already carry every
 * benchmark symbol used anywhere in the app, India's and US's alike.
 *
 * Also replicates the BENCHMARK'S OWN dividends (SPY/QQQ pay real dividends; Nifty 50 TRI is a Total
 * Return Index, dividends already reinvested into the index value, so `div[symbol]` is empty for it)
 * — same post-processing run() does for its own per-Ctx benchmark legs (`o.dividends` block), using
 * units held STRICTLY BEFORE each ex-date (a same-day flow doesn't yet count), same DEFAULT_WHT.
 * Missing this was caught 2026-09-26 by cross-checking this function's single-book-only output
 * against run()'s own `bench[symbol]` for that same book in isolation — they must match byte-for-
 * byte, since a 1-book "household" is exactly the case run() already handles; the SPY case was off by
 * >1pp of IRR before this was added. */
function replicateHousehold(
  interior: CF[], V0: number,
  dates: string[], px: Record<string, number[]>, fx: number[], div: Record<string, number>,
  symbol: string, isUSD: boolean, d0: string, d1: string, wantSeries: boolean, includeDividends: boolean,
): { leg: Leg; series: number[] | null } {
  const i0 = idxOn(dates, d0), i1 = idxOn(dates, d1);
  const d0ms = Date.parse(`${d0}T00:00:00Z`), d1ms = Date.parse(`${d1}T00:00:00Z`);
  const T = Math.max(1, d1ms - d0ms);
  const toBenchCcy = (v: number, i: number) => (isUSD ? v / fx[i] : v);
  let bu = 0;
  const cfs: CF[] = [];
  if (V0 > 0) { cfs.push({ ms: d0ms, v: -V0 }); bu = toBenchCcy(V0, i0) / px[symbol][i0]; }
  const sorted = interior.slice().sort((a, b) => a.ms - b.ms);
  let ptr = 0;
  const series: number[] | null = wantSeries ? [] : null;
  for (let i = i0; i <= i1; i++) {
    const dateStr = dates[i];
    const dms = Date.parse(`${dateStr}T00:00:00Z`);
    const buBeforeToday = bu; // units held strictly before today's own flows — what an ex-date on this day pays out on
    while (ptr < sorted.length && sorted[ptr].ms <= dms) {
      const e = sorted[ptr++];
      cfs.push({ ms: e.ms, v: e.v });
      // Price/convert each event at ITS OWN date's snapped trading-day index (matching run()'s
      // `e.i = idxOn(dates, x.d)`), not the day-loop's current `i` — a trade dated on a non-trading
      // day (weekend/holiday, common for MF allotment/settlement dates) would otherwise get priced
      // off the NEXT trading day the loop reaches instead of the SAME floor day run() uses, since the
      // while-loop's `sorted[ptr].ms <= dms` test only fires once the loop's own day catches up to or
      // passes the event's date. Caught 2026-09-26: this was the sole remaining cause of the
      // solo-India-into-Nifty cross-check mismatch (SPY/QQQ's own trades all land on trading days, so
      // the US cross-check happened to already match byte-for-byte before this fix).
      const ei = idxOn(dates, new Date(e.ms).toISOString().slice(0, 10));
      bu += -toBenchCcy(e.v, ei) / px[symbol][ei];
    }
    const per = includeDividends && dateStr > d0 && dateStr <= d1 ? div[dateStr] : undefined;
    if (per !== undefined && buBeforeToday > 0) {
      cfs.push({ ms: dms, v: buBeforeToday * per * (1 - DEFAULT_WHT) * (isUSD ? fx[i] : 1) });
    }
    if (series) series.push(bu * px[symbol][i] * (isUSD ? fx[i] : 1));
  }
  cfs.push({ ms: d1ms, v: bu * px[symbol][i1] * (isUSD ? fx[i1] : 1) });
  return { leg: legFromCashflows(cfs, V0, d1ms, T), series };
}

export function combinedRun(
  usCtx: Ctx, indiaCtx: Ctx, indiaAccounts: string[], start: string, end: string,
  opts: { series?: boolean; cryptoCtx?: Ctx; dividends?: boolean } = {},
): CombinedRunResult {
  // Price-only opt-out (2026-09-26): dividends default ON (total return is the economically correct
  // number), with an opt-out for a price-only comparison — same convention as every single-book
  // performance page. Gates BOTH sides of the comparison: each book's own dividend income (via
  // run()'s `dividends` option) AND the benchmark replica's own dividend income (via
  // replicateHousehold()'s `includeDividends`), so price-only vs price-only and total-return vs
  // total-return stay apples-to-apples — never portfolio-with-dividends vs benchmark-without.
  const includeDividends = opts.dividends ?? true;
  const us = run(usCtx, start, end, { currency: "INR", benchmarks: US_BENCHMARKS, dividends: includeDividends, series: opts.series });
  const india = run(indiaCtx, start, end, { accounts: indiaAccounts, benchmarks: [COMBINED_INDIA_BENCHMARK], dividends: includeDividends, series: opts.series });
  const crypto = opts.cryptoCtx ? run(opts.cryptoCtx, start, end, { benchmarks: [COMBINED_INDIA_BENCHMARK], series: opts.series }) : undefined;
  const V0 = us.V0 + india.V0 + (crypto?.V0 ?? 0), V1 = us.V1 + india.V1 + (crypto?.V1 ?? 0), net = us.net + india.net + (crypto?.net ?? 0);
  const d0ms = Date.parse(`${us.d0}T00:00:00Z`), d1ms = Date.parse(`${us.d1}T00:00:00Z`);
  const T = Math.max(1, d1ms - d0ms);

  // Strip each book's own boundary entries (the leading -V0, present only when that book had an
  // opening position, and the always-present trailing +V1) and splice only the genuine interior
  // flows together — see the header comment for why the naive concatenation was wrong.
  const interiorOf = (cf: CF[], bookV0: number) => cf.slice(bookV0 > 0 ? 1 : 0, -1);
  const interior: CF[] = [
    ...interiorOf(us.cashflows, us.V0),
    ...interiorOf(india.cashflows, india.V0),
    ...(crypto ? interiorOf(crypto.cashflows, crypto.V0) : []),
  ];
  const merged: CF[] = [...(V0 > 0 ? [{ ms: d0ms, v: -V0 }] : []), ...interior, { ms: d1ms, v: V1 }];
  const all = legFromCashflows(merged, V0, d1ms, T);

  // The benchmark replica reinvests only CAPITAL flows (trades) — same as run()'s own per-Ctx
  // benchmark legs, which never let a book's own dividend cash buy benchmark units (see
  // tradeCashflows's doc comment in engine.ts). Using the dividend-inclusive `interior` above here
  // was the second bug caught 2026-09-26 by the single-book cross-check (this function fed the
  // household's own dividend cash into the replica's unit count, which run() itself never does).
  const interiorTrades: CF[] = [
    ...interiorOf(us.tradeCashflows, us.V0),
    ...interiorOf(india.tradeCashflows, india.V0),
    ...(crypto ? interiorOf(crypto.tradeCashflows, crypto.V0) : []),
  ];
  const allBench: Record<string, Leg> = {};
  const allBenchSeries: Record<string, number[]> | null = opts.series ? {} : null;
  for (const { symbol, isUSD } of HOUSEHOLD_BENCHMARKS) {
    const rep = replicateHousehold(interiorTrades, V0, usCtx.dates, usCtx.px, usCtx.fx, usCtx.div[symbol] ?? {}, symbol, isUSD, us.d0, us.d1, !!opts.series, includeDividends);
    allBench[symbol] = rep.leg;
    if (allBenchSeries) allBenchSeries[symbol] = rep.series!;
  }

  return {
    d0: us.d0, d1: us.d1, days: us.days, annualised: us.annualised, hasData: us.hasData && india.hasData && (crypto ? crypto.hasData : true),
    V0, V1, net, us, india, crypto, all, allBench, allBenchSeries,
  };
}

// Re-exported so callers (the /portfolio/all/performance page) don't need a second import from
// engine.ts just for the merged stream's own IRR, if they ever need it standalone.
export { xirr };
