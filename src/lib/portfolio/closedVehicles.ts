// Derives a "value at cost" (hold-at-cost) price series for securities that live entirely inside
// closed/synthetic-encoding accounts — the 4 wound-down PMS vehicles (KCV-RIA, KFV-RIA, UNIFI-BLN,
// UNIFI-BCAD20 as of 2026-09) documented in closed-vehicle-historic-irr-ingestion-spec.md, and any
// future account ingested the same way. Generalizes on PortfolioAccount.isActive (already false on
// all four, set at ingestion) rather than hardcoding symbol names — same mechanism india-data.ts's
// `lotAccounts` already uses to exclude these from buildLots()/FIFO position tracking.
//
// Background (2026-09-26 investigation, "All assets value below net invested" / "IRR wrong when a
// closed vehicle is included"): each contribution/withdrawal into one of these vehicles is recorded
// as a single qty=1 trade at the contribution/exit AMOUNT — correct for XIRR's dated-cashflow timing,
// but it leaves the position's INTERIM "value" (units x price) meaningless. Historically these
// symbols were priced at a flat Rs 0.01 placeholder in prices_daily for their entire holding life, so
// any date between entry and exit understated real capital (multi-lakh/crore) as near-zero value —
// distorting both the value/net-invested comparison AND any period boundary (V0/V1) that fell while
// one of these vehicles was open (XIRR included, not just Modified-Dietz).
//
// Fix (Option B, "value at cost"): replace the placeholder with a derived price such that
// unitsHeld(date) * price(date) reproduces the vehicle's own remaining net contribution (cumulative
// contributed minus cumulative returned, floored at 0) at every trade date — i.e. "this position is
// worth what's still tied up in it," a defensible lower-bound-ish estimate given no real NAV/mark is
// available, and a large improvement over "worth ~nothing." buildContext()'s forward-fill then holds
// this flat between events and out to the latest date in the dataset. After the vehicle's final exit
// trade, remaining cost naturally floors at (near) 0, so the price (and hence value) correctly drops
// to ~0 for the period after full exit without any special-casing.
import type { RawTrade } from "./engine";

export type ClosedVehicleData = {
  /** Symbols whose entire trade history sits inside inactive (closed-vehicle) accounts. */
  symbols: Set<string>;
  /** symbol -> tradeDate -> derived hold-at-cost price, one entry per distinct trade date for that
   * symbol (same date-key format as Dataset.prices, "YYYY-MM-DD"). Meant to fully REPLACE (not merge
   * with) that symbol's DB-loaded price map. */
  prices: Record<string, Record<string, number>>;
};

/** `inactiveAccountKeys`: PortfolioAccount.key for every account with isActive === false. A symbol
 * qualifies only when ALL of its trades belong to such accounts — a symbol that ALSO trades in a live
 * account (not expected today, but not assumed away) is left untouched, so this never overrides a
 * real, live-tracked security's real price history. */
export function closedVehicleData(trades: RawTrade[], inactiveAccountKeys: Set<string>): ClosedVehicleData {
  const symbolAccounts = new Map<string, Set<string>>();
  for (const t of trades) {
    if (!symbolAccounts.has(t.symbol)) symbolAccounts.set(t.symbol, new Set());
    symbolAccounts.get(t.symbol)!.add(t.account);
  }
  const symbols = new Set<string>();
  for (const [sym, accts] of symbolAccounts) {
    if ([...accts].every((a) => inactiveAccountKeys.has(a))) symbols.add(sym);
  }

  const prices: Record<string, Record<string, number>> = {};
  for (const sym of symbols) {
    const symTrades = trades.filter((t) => t.symbol === sym).slice().sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : 0));
    const byDate = new Map<string, RawTrade[]>();
    for (const t of symTrades) {
      if (!byDate.has(t.tradeDate)) byDate.set(t.tradeDate, []);
      byDate.get(t.tradeDate)!.push(t);
    }
    const dates = [...byDate.keys()].sort();
    let costBasis = 0; // cumulative net contribution still "in" the vehicle, floored at 0
    let unitsHeld = 0; // the qty=1-per-event counter — not economically meaningful on its own, only
    // as the denominator that makes unitsHeld * price reproduce costBasis
    const out: Record<string, number> = {};
    for (const d of dates) {
      for (const tr of byDate.get(d)!) {
        if (tr.side === "BUY") {
          costBasis += tr.qty * tr.price + tr.fee;
          unitsHeld += tr.qty;
        } else {
          costBasis -= tr.qty * tr.price - tr.fee;
          unitsHeld -= tr.qty;
        }
      }
      costBasis = Math.max(0, costBasis);
      out[d] = unitsHeld !== 0 ? costBasis / unitsHeld : 0;
    }
    prices[sym] = out;
  }
  return { symbols, prices };
}
