// View models for the Portfolio screens. Pure functions over the engine Ctx / LotBook; no DB access.
import { buildLots, idxOn, inceptionStart, run, symbolsOf, type Ctx, type Leg, type LotBook, type RunOpts, type RunResult, type SeriesPt } from "./engine";
import { addMonthsISO, holdingClass } from "./tax";

export type PeriodDef = { key: string; label: string; group: "rolling" | "cy" | "fy"; start: string; end: string };
export const BROKERS = { ALL: undefined, INDmoney: ["INDMONEY_ALPACA"], IBKR: ["IBKR"] } as const;
export type BrokerKey = keyof typeof BROKERS;
export const accountsFor = (b: BrokerKey) => (BROKERS[b] ? [...BROKERS[b]!] : undefined);

export function periodDefs(ctx: Ctx, accounts?: string[]): PeriodDef[] {
  const asof = ctx.asof, inc = inceptionStart(ctx, accounts), y = +asof.slice(0, 4);
  const out: PeriodDef[] = [
    { key: "1M", label: "1M", group: "rolling", start: addMonthsISO(asof, -1), end: asof },
    { key: "3M", label: "3M", group: "rolling", start: addMonthsISO(asof, -3), end: asof },
    { key: "6M", label: "6M", group: "rolling", start: addMonthsISO(asof, -6), end: asof },
    { key: "YTD", label: "YTD", group: "rolling", start: `${y - 1}-12-31`, end: asof },
    { key: "1Y", label: "1Y", group: "rolling", start: addMonthsISO(asof, -12), end: asof },
    { key: "2Y", label: "2Y", group: "rolling", start: addMonthsISO(asof, -24), end: asof },
    { key: "3Y", label: "3Y", group: "rolling", start: addMonthsISO(asof, -36), end: asof },
    { key: "SI", label: "Since first trade", group: "rolling", start: inc, end: asof },
  ];
  for (let cy = +inc.slice(0, 4) + (inc.slice(5) === "12-31" ? 1 : 0); cy <= y; cy++) {
    const end = `${cy}-12-31`;
    out.push({ key: `CY${cy}`, label: end > asof ? `CY ${cy} YTD` : `CY ${cy}`, group: "cy", start: `${cy - 1}-12-31`, end: end > asof ? asof : end });
  }
  for (let fy = +inc.slice(0, 4); fy <= y + 1; fy++) {
    const start = `${fy - 1}-03-31`, end = `${fy}-03-31`;
    if (end <= inc || start >= asof) continue;
    out.push({ key: `FY${fy}`, label: `FY ${fy - 1}-${String(fy).slice(2)}${end > asof ? " YTD" : ""}`, group: "fy", start, end: end > asof ? asof : end });
  }
  return out.map((p) => (p.start < inc ? { ...p, start: inc } : p)).filter((p) => p.end > p.start);
}

export function pickPeriod(ctx: Ctx, key: string | undefined, accounts?: string[]): PeriodDef {
  const defs = periodDefs(ctx, accounts);
  return defs.find((d) => d.key === key) ?? defs.find((d) => d.key === "SI")!;
}

export const runPeriod = (ctx: Ctx, p: { start: string; end: string }, o: RunOpts = {}) => run(ctx, p.start, p.end, o);

/** Headline number for a leg: annualised IRR when the period is >= 90 days, otherwise the period return. */
export function headline(leg: Leg, r: { annualised: boolean }): { value: number | null; kind: "IRR" | "Return" } {
  return r.annualised ? { value: leg.irr, kind: "IRR" } : { value: leg.ret, kind: "Return" };
}
export function alpha(a: Leg, b: Leg, r: { annualised: boolean }): number | null {
  const x = headline(a, r).value, y = headline(b, r).value;
  return x == null || y == null ? null : x - y;
}

export function downsample(series: SeriesPt[], max = 260): SeriesPt[] {
  if (series.length <= max) return series;
  const step = Math.ceil(series.length / max), out = series.filter((_, i) => i % step === 0);
  if (out[out.length - 1] !== series[series.length - 1]) out.push(series[series.length - 1]);
  return out;
}

export type Decomposition = { price: number; dividends: number; fx: number; total: number; fxRateStart: number; fxRateEnd: number };
/** INR gain split into USD price effect, USD dividends and currency: INR profit = USD profit x FX_end + FX effect on invested capital. */
export function decompose(ctx: Ctx, p: { start: string; end: string }, o: RunOpts): Decomposition {
  const usd = run(ctx, p.start, p.end, { ...o, currency: "USD", series: false });
  const inr = run(ctx, p.start, p.end, { ...o, currency: "INR", series: false });
  const fx1 = ctx.fx[idxOn(ctx.dates, usd.d1)], fx0 = ctx.fx[idxOn(ctx.dates, usd.d0)];
  return { price: (usd.pf.profit - usd.divTot) * fx1, dividends: usd.divTot * fx1, fx: inr.pf.profit - usd.pf.profit * fx1, total: inr.pf.profit, fxRateStart: fx0, fxRateEnd: fx1 };
}

export type StockRow = { symbol: string; status: "open" | "exited"; d0: string; d1: string; days: number; annualised: boolean; pf: Leg; SPY: Leg; QQQ: Leg; V1: number; profit: number };
/** Per-stock performance over a period. Exited positions are measured to their exit date, not the period end. */
export function stockRows(ctx: Ctx, p: { start: string; end: string }, o: RunOpts): StockRow[] {
  const rows: StockRow[] = [];
  for (const sym of symbolsOf(ctx, o.accounts)) {
    let r = run(ctx, p.start, p.end, { ...o, symbols: [sym], series: false });
    if (!r.hasData) continue;
    let status: StockRow["status"] = "open";
    const unitsEnd = ctx.trades.filter((t) => t.symbol === sym && (!o.accounts || o.accounts.includes(t.account)) && t.d <= p.end).reduce((a, t) => a + (t.side === "BUY" ? t.q : -t.q), 0);
    if (Math.abs(unitsEnd) < 1e-3) {
      const last = ctx.trades.filter((t) => t.symbol === sym && (!o.accounts || o.accounts.includes(t.account)) && t.d <= p.end).map((t) => t.d).sort().pop()!;
      if (last > p.start && last < p.end) r = run(ctx, p.start, last, { ...o, symbols: [sym], series: false });
      status = "exited";
    }
    rows.push({ symbol: sym, status, d0: r.d0, d1: r.d1, days: r.days, annualised: r.annualised, pf: r.pf, SPY: r.SPY, QQQ: r.QQQ, V1: r.V1, profit: r.pf.profit });
  }
  return rows.sort((a, b) => (a.status === b.status ? b.V1 - a.V1 || b.profit - a.profit : a.status === "open" ? -1 : 1));
}

// ── Holdings and lots ────────────────────────────────────────────────────────────────────────

export type LotRow = { account: string; openDate: string; qty: number; costPerUnit: number; cost: number; value: number; gain: number; ageDays: number; ltDate: string; isLong: boolean; daysToLT: number };
export type Position = { symbol: string; units: number; cost: number; avgCost: number; price: number; value: number; gain: number; gainPct: number; weight: number; lots: LotRow[] };

export function positions(ctx: Ctx, book: LotBook): { rows: Position[]; totalValue: number; totalCost: number; price: Record<string, number> } {
  const last = ctx.dates.length - 1, asof = ctx.asof;
  const by = new Map<string, Position>();
  const price: Record<string, number> = {};
  for (const l of book.open) {
    if (l.qty < 1e-5) continue; // float dust left over from split-adjusted FIFO arithmetic
    const px = ctx.px[l.symbol][last]; price[l.symbol] = px;
    const cost = l.qty * (l.costPerUnit + l.feePerUnit), value = l.qty * px;
    const hc = holdingClass(l.openDate, asof);
    const lot: LotRow = { account: l.account, openDate: l.openDate, qty: l.qty, costPerUnit: l.costPerUnit + l.feePerUnit, cost, value, gain: value - cost, ageDays: Math.round((Date.parse(asof) - Date.parse(l.openDate)) / 86400000), ltDate: hc.ltDate, isLong: hc.isLong, daysToLT: hc.daysToLT };
    const p = by.get(l.symbol) ?? { symbol: l.symbol, units: 0, cost: 0, avgCost: 0, price: px, value: 0, gain: 0, gainPct: 0, weight: 0, lots: [] };
    p.units += l.qty; p.cost += cost; p.value += value; p.lots.push(lot);
    by.set(l.symbol, p);
  }
  const rows = [...by.values()];
  const totalValue = rows.reduce((a, r) => a + r.value, 0), totalCost = rows.reduce((a, r) => a + r.cost, 0);
  for (const r of rows) { r.avgCost = r.cost / r.units; r.gain = r.value - r.cost; r.gainPct = r.cost ? r.gain / r.cost : 0; r.weight = totalValue ? r.value / totalValue : 0; r.lots.sort((a, b) => (a.openDate < b.openDate ? -1 : 1)); }
  rows.sort((a, b) => b.value - a.value);
  return { rows, totalValue, totalCost, price };
}

export type DisposalRow = { symbol: string; account: string; openDate: string; closeDate: string; qty: number; cost: number; proceeds: number; gain: number; days: number; isLong: boolean; daysShort: number; ltDate: string };
export function disposalRows(book: LotBook): DisposalRow[] {
  return book.disposals.map((d) => {
    const hc = holdingClass(d.openDate, d.closeDate);
    return { symbol: d.symbol, account: d.account, openDate: d.openDate, closeDate: d.closeDate, qty: d.qty, cost: d.cost, proceeds: d.proceeds, gain: d.gain, days: d.holdingDays, isLong: hc.isLong, daysShort: hc.daysToLT, ltDate: hc.ltDate };
  }).sort((a, b) => (a.closeDate < b.closeDate ? 1 : -1));
}
export { buildLots };
