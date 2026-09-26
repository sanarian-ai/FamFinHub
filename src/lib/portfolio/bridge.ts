import type { CF, RunResult } from "./engine";
import type { CombinedRunResult } from "./combined";

/**
 * The "why should I trust this number" reconciliation for a performance page — added 2026-09-26.
 * Two things a user can't verify by eyeballing an XIRR/Modified-Dietz % on its own:
 *   1. Is the cash-flow ledger feeding the rate complete/correct? (no missing or double-counted flow)
 *   2. Is the annualised rate itself a faithful function of that ledger? (no solve-method bug)
 * The value bridge (Starting + Added − Withdrawn + Price gain = Ending) answers (1): every number in
 * it is either already shown elsewhere on the page (V0/V1) or a plain sum of the SAME cashflow list
 * `run()`'s own IRR/Modified-Dietz are computed from — so if it doesn't reconcile, something is
 * genuinely wrong upstream, not just hard to eyeball. Showing Modified-Dietz next to XIRR answers
 * (2) for free: both are already computed by `legFromCashflows` from the same cashflows, so a wide
 * divergence between two independently-computed rates is itself a red flag worth surfacing.
 *
 * Dividends are deliberately NOT folded into "Capital withdrawn": in this engine's per-symbol,
 * no-cash-balance model, a dividend leaves the tracked position value exactly like a sale would
 * (see engine.ts's `net` bookkeeping), but conflating "you sold" with "the position paid you" under
 * one "withdrawn" bucket would read as if income were a deliberate withdrawal. They're shown as
 * their own line, in a second, clearly separate "return components" block that reconciles to
 * `pf.profit`/`all.profit` (the number XIRR/Modified-Dietz are actually computed over) rather than
 * to the ending value.
 *
 * `dividends` here is deliberately NOT `RunResult.divTot`: that field converts its USD-accumulated
 * total to INR using the PERIOD-END fx rate alone (`divTot * fx1` in engine.ts's return), whereas the
 * cashflows `profit` is summed from convert each dividend event at ITS OWN date's fx rate — a real,
 * pre-existing gap between the two (caught while building this panel: ~6.6% on a 2Y US-book INR run,
 * ₹4,692 off a ₹71k total) that has nothing to do with IRR/Modified-Dietz itself (those already use
 * the per-event-correct cashflows) but would make this reconciliation panel fail its own tie-out on
 * every INR dividend-inclusive run. `dividends` is instead solved as the plug against `profit`
 * (`profit − priceGain`), exactly mirroring how `priceGain` is solved as the plug against the ending
 * value — so both halves of the panel always reconcile exactly, by construction, regardless of that
 * separate divTot quirk (worth fixing in engine.ts on its own, but out of scope here).
 */
export type Bridge = {
  d0: string;
  d1: string;
  days: number;
  annualised: boolean;
  startValue: number;
  added: number;
  withdrawn: number;
  dividends: number;
  /** Price appreciation/depreciation only — excludes dividends. Solved as the plug that makes the
   *  value bridge tie out exactly: startValue + added − withdrawn + priceGain = endValue. */
  priceGain: number;
  /** Always equal to the Leg's own `profit` (the number XIRR/Modified-Dietz are computed over) —
   *  shown directly, not re-derived, so the return-components block ties out by construction. */
  totalGain: number;
  endValue: number;
  irr: number | null;
  ret: number | null;
  /** |dividends (the profit-priceGain plug) − RunResult.divTot|. Should be small — divTot uses a
   *  slightly different (period-end-only) fx conversion for INR runs, see the header comment — but a
   *  LARGE value here would mean something beyond that known FX rounding, worth a closer look. */
  checkDiff: number;
  /** True when this period's start or end boundary falls while a closed PMS vehicle (KCV/KFV/Unifi
   *  BLN/BCAD20 etc.) is still open — its value at that boundary is a derived "value at cost"
   *  estimate, not a real mark, so the IRR/Modified-Dietz above should be read as directional rather
   *  than precise for this period. See RunResult.unreliableBoundary / closedVehicles.ts. Always false
   *  for a book with no closed-vehicle accounts (US, crypto, India Equity/MF alone). */
  unreliableBoundary: boolean;
};

function splitInterior(tradeCashflows: CF[], v0: number): { added: number; withdrawn: number } {
  // Same slice run()'s own legFromCashflows uses to skip the boundary entries: drop the leading -V0
  // (only present when there was an opening position) and the trailing +V1.
  const interior = tradeCashflows.slice(v0 > 0 ? 1 : 0, -1);
  let added = 0;
  let withdrawn = 0;
  for (const cf of interior) {
    if (cf.v < 0) added += -cf.v;
    else withdrawn += cf.v;
  }
  return { added, withdrawn };
}

export function bridgeFromRun(r: RunResult): Bridge {
  const { added, withdrawn } = splitInterior(r.tradeCashflows, r.V0);
  const priceGain = r.V1 - r.V0 - added + withdrawn;
  const totalGain = r.pf.profit;
  const dividends = totalGain - priceGain;
  return {
    d0: r.d0,
    d1: r.d1,
    days: r.days,
    annualised: r.annualised,
    startValue: r.V0,
    added,
    withdrawn,
    dividends,
    priceGain,
    totalGain,
    endValue: r.V1,
    irr: r.pf.irr,
    ret: r.pf.ret,
    checkDiff: Math.abs(dividends - r.divTot),
    unreliableBoundary: r.unreliableBoundary,
  };
}

export function bridgeFromCombined(c: CombinedRunResult): Bridge {
  const books = [c.us, c.india, c.crypto].filter((x): x is RunResult => !!x);
  let added = 0;
  let withdrawn = 0;
  let divTotSum = 0;
  for (const r of books) {
    const s = splitInterior(r.tradeCashflows, r.V0);
    added += s.added;
    withdrawn += s.withdrawn;
    divTotSum += r.divTot;
  }
  const priceGain = c.V1 - c.V0 - added + withdrawn;
  const totalGain = c.all.profit;
  const dividends = totalGain - priceGain;
  return {
    d0: c.d0,
    d1: c.d1,
    days: c.days,
    annualised: c.annualised,
    startValue: c.V0,
    added,
    withdrawn,
    dividends,
    priceGain,
    totalGain,
    endValue: c.V1,
    irr: c.all.irr,
    ret: c.all.ret,
    checkDiff: Math.abs(dividends - divTotSum),
    unreliableBoundary: c.unreliableBoundary,
  };
}
