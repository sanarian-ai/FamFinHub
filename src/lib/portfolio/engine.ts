// Pure portfolio engine: split-aware positions, XIRR, benchmark replicas, FIFO lots and disposals.
// No DB or framework imports — every screen and the tax export must go through this module.
// Inputs are RAW broker data: trade qty/price as reported and as-traded prices. Splits are applied
// here via CorporateAction rows (see splits.ts). Verified against golden fixtures
// (scripts/portfolio/test-engine.ts), which come from the independently checked prototype.
import { splitFactor, type SplitAction } from "./splits";

export type Side = "BUY" | "SELL";
export type RawTrade = { account: string; symbol: string; side: Side; qty: number; price: number; fee: number; tradeDate: string };
export type RawAction = SplitAction & { symbol: string };
export type Dataset = {
  trades: RawTrade[];
  actions: RawAction[];
  prices: Record<string, Record<string, number>>; // symbol -> date -> as-traded close (incl. benchmarks)
  dividends: Record<string, Record<string, number>>; // symbol -> ex-date -> as-traded dividend per share
  fx: Record<string, number>; // date -> USDINR
};
// Default benchmark pair for calls that don't specify RunOpts.benchmarks — the US book's SPY/QQQ.
// Any caller (India, PMS, MF, combined) can pass its own `benchmarks: string[]` instead; the result's
// generic `bench` record is keyed by whatever was requested. `.SPY`/`.QQQ` on RunResult/SeriesPt stay
// as convenience aliases for the default pair specifically, so the existing US screens and
// test-engine.ts (which read r.SPY/r.QQQ directly, never passing `benchmarks`) need no changes; they
// fall back to a zero/null Leg — never crash — for a call whose benchmark set doesn't include them.
export const BENCHMARKS = ["SPY", "QQQ"] as const;
export type Bench = (typeof BENCHMARKS)[number];
export const DEFAULT_WHT = 0.25; // US withholding assumed on dividends until actuals are ingested
export const MIN_ANNUALISE_DAYS = 90; // do not present an annualised figure for shorter periods

const DAY = 86400000;
const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
export const isoDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type AdjTrade = { account: string; symbol: string; side: Side; q: number; d: string; cash: number }; // q split-adjusted, cash to investor (+in/-out, USD)
export type Ctx = {
  dates: string[];
  px: Record<string, number[]>; // split-adjusted, forward-filled
  fx: number[];
  div: Record<string, Record<string, number>>; // split-adjusted per share
  trades: AdjTrade[];
  asof: string;
};

export function buildContext(ds: Dataset): Ctx {
  const set = new Set<string>();
  for (const s of Object.keys(ds.prices)) for (const d of Object.keys(ds.prices[s])) set.add(d);
  const dates = [...set].sort();
  const acts = (sym: string) => ds.actions.filter((a) => a.symbol === sym);
  const ffill = (get: (d: string) => number | undefined) => {
    const out: number[] = new Array(dates.length);
    let last: number | undefined;
    for (let i = 0; i < dates.length; i++) { const v = get(dates[i]); if (v !== undefined) last = v; out[i] = last as number; }
    const first = out.find((x) => x !== undefined);
    return out.map((x) => (x === undefined ? (first as number) : x));
  };
  const px: Record<string, number[]> = {};
  for (const s of Object.keys(ds.prices)) {
    const a = acts(s);
    px[s] = ffill((d) => (ds.prices[s][d] === undefined ? undefined : ds.prices[s][d] / splitFactor(a, d)));
  }
  const fx = ffill((d) => ds.fx[d]);
  const div: Ctx["div"] = {};
  for (const s of Object.keys(ds.dividends)) {
    const a = acts(s); div[s] = {};
    for (const [d, v] of Object.entries(ds.dividends[s])) div[s][d] = v / splitFactor(a, d);
  }
  const trades: AdjTrade[] = ds.trades
    .map((x) => {
      const f = splitFactor(acts(x.symbol), x.tradeDate);
      const amt = x.qty * x.price;
      return { account: x.account, symbol: x.symbol, side: x.side, q: x.qty * f, d: x.tradeDate, cash: x.side === "BUY" ? -(amt + x.fee) : amt - x.fee };
    })
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
  return { dates, px, fx, div, trades, asof: dates[dates.length - 1] };
}

export type CF = { ms: number; v: number };

/** Money-weighted annual return by bisection. cfs: dated cash flows, + to investor. */
export function xirr(cfs: CF[]): number | null {
  if (cfs.length < 2) return null;
  const t0 = Math.min(...cfs.map((c) => c.ms));
  const f = (r: number) => { let s = 0; for (const c of cfs) s += c.v / Math.pow(1 + r, (c.ms - t0) / (365 * DAY)); return s; };
  let lo = -0.9999, hi = 10, flo = f(lo), fhi = f(hi), guard = 0;
  while (flo * fhi > 0 && hi < 1e6 && guard++ < 12) { hi *= 4; fhi = f(hi); }
  if (flo * fhi > 0) return null;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2, fm = f(m); if (flo * fm <= 0) { hi = m; fhi = fm; } else { lo = m; flo = fm; } }
  return (lo + hi) / 2;
}

export type RunOpts = {
  symbols?: string[]; accounts?: string[]; currency?: "USD" | "INR"; dividends?: boolean; wht?: number; series?: boolean;
  benchmarks?: readonly string[]; // defaults to BENCHMARKS (["SPY","QQQ"]) — pass an India/PMS/MF/combined set instead
};
export type Leg = { end: number; profit: number; irr: number | null; ret: number | null; moic: number | null };
const EMPTY_LEG: Leg = { end: 0, profit: 0, irr: null, ret: null, moic: null };
export type SeriesPt = { d: string; pf: number; SPY: number; QQQ: number; inv: number; bench: Record<string, number> };
export type RunResult = {
  d0: string; d1: string; days: number; V0: number; V1: number; net: number; divTot: number; hasData: boolean;
  annualised: boolean; // false when the period is shorter than MIN_ANNUALISE_DAYS: show the period return, not the IRR
  pf: Leg; SPY: Leg; QQQ: Leg; bench: Record<string, Leg>; series: SeriesPt[] | null;
  /** The portfolio's own dated cash-flow stream (INR/USD per RunOpts.currency, + to investor),
   * including the V0/V1 boundary entries — same list `pf`'s IRR/moic/ret are computed from. Exposed
   * so a caller combining two books (see combined.ts) can merge two already-correctly-anchored
   * streams and run one xirr()/legFromCashflows() over the union, instead of extending run() itself
   * to understand a mixed-currency Ctx (fxAt() applies one multiplier uniformly across a whole run —
   * see combined.ts's header comment for why that rules out a single merged-Ctx call). */
  cashflows: CF[];
};

export function symbolsOf(ctx: Ctx, accounts?: string[]): string[] {
  return [...new Set(ctx.trades.filter((x) => !accounts || accounts.includes(x.account)).map((x) => x.symbol))].sort();
}
export function firstTradeDate(ctx: Ctx, accounts?: string[]): string {
  return ctx.trades.find((x) => !accounts || accounts.includes(x.account))!.d;
}
/** Day before the first trade: the natural "since inception" start. */
export function inceptionStart(ctx: Ctx, accounts?: string[]): string {
  return isoDate(t(firstTradeDate(ctx, accounts)) - DAY);
}

export function idxOn(dates: string[], d: string): number {
  let lo = 0, hi = dates.length - 1, r = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dates[m] <= d) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

export function run(ctx: Ctx, start: string, end: string, o: RunOpts = {}): RunResult {
  const { dates, px } = ctx;
  const B: readonly string[] = o.benchmarks ?? BENCHMARKS;
  const S = o.symbols ?? symbolsOf(ctx, o.accounts);
  const inc = (x: AdjTrade) => S.includes(x.symbol) && (!o.accounts || o.accounts.includes(x.account));
  const fxAt = (i: number) => (o.currency === "INR" ? ctx.fx[i] : 1);
  const wht = o.wht ?? DEFAULT_WHT;
  const unitsAt = (sym: string, d: string, strict: boolean) => {
    let u = 0;
    for (const x of ctx.trades) {
      if (x.symbol !== sym || (o.accounts && !o.accounts.includes(x.account))) continue;
      if (strict ? x.d < d : x.d <= d) u += x.side === "BUY" ? x.q : -x.q;
    }
    return Math.abs(u) < 1e-7 ? 0 : u;
  };
  const i0 = idxOn(dates, start), i1 = idxOn(dates, end);
  const d0 = dates[i0], d1 = dates[i1];
  const pos: Record<string, number> = {}; let V0 = 0;
  for (const s of S) { pos[s] = unitsAt(s, d0, false); V0 += pos[s] * px[s][i0]; }
  type Ev = { i: number; d: string; kind: "T" | "D"; sym: string; side?: Side; q?: number; usd?: number; per?: number };
  const ev: Ev[] = [];
  for (const x of ctx.trades) {
    if (!inc(x) || x.d <= d0 || x.d > d1) continue;
    ev.push({ i: idxOn(dates, x.d), d: x.d, kind: "T", sym: x.symbol, side: x.side, q: x.q, usd: x.cash });
  }
  if (o.dividends) {
    for (const s of S) for (const [exd, per] of Object.entries(ctx.div[s] ?? {})) if (exd > d0 && exd <= d1) ev.push({ i: idxOn(dates, exd), d: exd, kind: "D", sym: s, per });
  }
  ev.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.kind === "D" ? -1 : 1));
  const cfs: Record<string, CF[]> = { pf: [] };
  for (const b of B) cfs[b] = [];
  const bu: Record<string, number> = {};
  for (const b of B) bu[b] = 0;
  if (V0 > 0) { cfs.pf.push({ ms: t(d0), v: -V0 * fxAt(i0) }); for (const b of B) { cfs[b].push({ ms: t(d0), v: -V0 * fxAt(i0) }); bu[b] = V0 / px[b][i0]; } }
  let net = V0, divTot = 0;
  const p = { ...pos };
  const series: SeriesPt[] | null = o.series ? [] : null;
  let evp = 0;
  for (let i = i0; i <= i1; i++) {
    const d = dates[i];
    while (evp < ev.length && ev[evp].d <= d) {
      const e = ev[evp++]; const fxi = fxAt(e.i);
      if (e.kind === "T") {
        const cash = e.usd!;
        p[e.sym] += e.side === "BUY" ? e.q! : -e.q!;
        cfs.pf.push({ ms: t(e.d), v: cash * fxi });
        net += -cash;
        for (const b of B) { cfs[b].push({ ms: t(e.d), v: cash * fxi }); bu[b] += -cash / px[b][e.i]; }
      } else {
        const cash = unitsAt(e.sym, e.d, true) * e.per! * (1 - wht); divTot += cash;
        cfs.pf.push({ ms: t(e.d), v: cash * fxi });
        net += -cash;
      }
    }
    if (series) {
      let v = 0; for (const s of S) v += p[s] * px[s][i];
      const benchAtI: Record<string, number> = {};
      for (const b of B) benchAtI[b] = bu[b] * px[b][i] * fxAt(i);
      series.push({ d, pf: v * fxAt(i), SPY: benchAtI.SPY ?? 0, QQQ: benchAtI.QQQ ?? 0, inv: net * fxAt(i), bench: benchAtI });
    }
  }
  if (o.dividends) {
    const tev = ev.filter((e) => e.kind === "T");
    for (const b of B) for (const [exd, per] of Object.entries(ctx.div[b] ?? {})) {
      if (exd > d0 && exd <= d1) {
        let u = V0 > 0 ? V0 / px[b][i0] : 0;
        for (const e of tev) if (e.d < exd) u += -e.usd! / px[b][e.i];
        cfs[b].push({ ms: t(exd), v: u * per * (1 - wht) * fxAt(idxOn(dates, exd)) });
      }
    }
  }
  let V1 = 0; for (const s of S) V1 += p[s] * px[s][i1];
  const fx1 = fxAt(i1);
  cfs.pf.push({ ms: t(d1), v: V1 * fx1 });
  for (const b of B) cfs[b].push({ ms: t(d1), v: bu[b] * px[b][i1] * fx1 });
  const days = (t(d1) - t(d0)) / DAY;
  const startV = V0 * fxAt(i0);
  const T = Math.max(1, t(d1) - t(d0));
  const leg = (c: CF[]): Leg => legFromCashflows(c, startV, t(d1), T);
  const bench: Record<string, Leg> = {};
  for (const b of B) bench[b] = leg(cfs[b]);
  return {
    d0, d1, days, V0: startV, V1: V1 * fx1, net: net * fx1, divTot: divTot * fx1, hasData: cfs.pf.length > 1, annualised: days >= MIN_ANNUALISE_DAYS,
    pf: leg(cfs.pf), SPY: bench.SPY ?? EMPTY_LEG, QQQ: bench.QQQ ?? EMPTY_LEG, bench, series, cashflows: cfs.pf,
  };
}

/** Money-weighted Leg stats (IRR/profit/ret/moic) for one dated cash-flow stream `c` (as produced by
 * `run()`'s `cashflows`/`bench[...]` — the first entry is the -V0 boundary when a starting position
 * existed, the last is the +V1 boundary). `startV` is that stream's own V0 (already currency-
 * converted); `d1ms`/`Tms` are the period's end timestamp and duration in ms (`t(d1)` and
 * `Math.max(1, t(d1) - t(d0))` in run()'s own terms). Extracted from run()'s internal `leg` closure
 * (step 2) so a caller merging two books' cash-flow streams (combined.ts) can compute the merged
 * stream's Leg with the exact same math, instead of re-deriving it. */
export function legFromCashflows(c: CF[], startV: number, d1ms: number, Tms: number): Leg {
  const endV = c[c.length - 1].v;
  const first = startV > 0 ? 1 : 0;
  let den = startV, mid = 0;
  for (let j = first; j < c.length - 1; j++) { den += -c[j].v * ((d1ms - c[j].ms) / Tms); mid += c[j].v; }
  const gain = endV + mid - (startV > 0 ? startV : 0);
  let outs = startV > 0 ? startV : 0, ins = 0;
  for (let j = first; j < c.length; j++) { if (c[j].v < 0) outs += -c[j].v; else ins += c[j].v; }
  return { end: endV, profit: c.reduce((a, x) => a + x.v, 0), irr: xirr(c), ret: den > 0 ? gain / den : null, moic: outs > 0 ? ins / outs : null };
}

// ── FIFO lots and disposals (per account + symbol) ──────────────────────────────────────────

export type Lot = { account: string; symbol: string; openDate: string; qty: number; costPerUnit: number; feePerUnit: number };
export type Disposal = {
  account: string; symbol: string; openDate: string; closeDate: string; qty: number; holdingDays: number;
  cost: number; proceeds: number; gain: number; // USD, fees folded into cost/proceeds; qty in current (post-split) units
};
export type LotBook = { open: Lot[]; disposals: Disposal[] };

export function buildLots(ds: Dataset, accounts?: string[]): LotBook {
  const open: Lot[] = []; const disposals: Disposal[] = [];
  const sorted = ds.trades.filter((x) => !accounts || accounts.includes(x.account)).slice()
    .sort((a, b) => (a.tradeDate < b.tradeDate ? -1 : a.tradeDate > b.tradeDate ? 1 : a.side === b.side ? 0 : a.side === "BUY" ? -1 : 1));
  for (const x of sorted) {
    const acts = ds.actions.filter((a) => a.symbol === x.symbol);
    const f = splitFactor(acts, x.tradeDate);
    const q = x.qty * f, pu = x.price / f, feeU = x.fee / q;
    if (x.side === "BUY") { open.push({ account: x.account, symbol: x.symbol, openDate: x.tradeDate, qty: q, costPerUnit: pu, feePerUnit: feeU }); continue; }
    let rem = q;
    for (const lot of open) {
      if (rem <= 1e-9) break;
      if (lot.account !== x.account || lot.symbol !== x.symbol || lot.qty <= 1e-9) continue;
      const take = Math.min(lot.qty, rem);
      const cost = take * (lot.costPerUnit + lot.feePerUnit);
      const proceeds = take * pu - take * feeU;
      disposals.push({ account: x.account, symbol: x.symbol, openDate: lot.openDate, closeDate: x.tradeDate, qty: take,
        holdingDays: Math.round((t(x.tradeDate) - t(lot.openDate)) / DAY), cost, proceeds, gain: proceeds - cost });
      lot.qty -= take; rem -= take;
    }
    if (rem > 1e-6) throw new Error(`Oversold ${x.symbol} in ${x.account} on ${x.tradeDate} by ${rem}`);
  }
  return { open: open.filter((l) => l.qty > 1e-9), disposals };
}
