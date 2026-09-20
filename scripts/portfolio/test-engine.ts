// Engine tests. Run: npx tsx scripts/portfolio/test-engine.ts  (exit 1 on any failure)
//  1. Parity with the independently verified prototype across 204 scenarios (fixtures/golden_prototype.json)
//  2. The six headline fixtures published in us-portfolio-data-architecture.md section 9
//  3. FIFO lots: units reconcile to broker snapshots; realised + unrealised == total P&L
import fs from "node:fs";
import path from "node:path";
import { buildContext, buildLots, inceptionStart, run, symbolsOf, type Dataset } from "../../src/lib/portfolio/engine";

const seed = path.join(process.cwd(), "prisma", "seed-data", "portfolio");
const load = (n: string) => JSON.parse(fs.readFileSync(path.join(seed, `${n}.json`), "utf8"));
const golden = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts/portfolio/fixtures/golden_prototype.json"), "utf8"));

const ds: Dataset = { trades: [], actions: [], prices: {}, dividends: {}, fx: {} };
for (const x of load("transactions")) ds.trades.push({ account: x.account, symbol: x.symbol, side: x.side, qty: +x.qty, price: +x.price, fee: +x.fee, tradeDate: x.tradeDate });
for (const a of load("corporate_actions")) ds.actions.push({ symbol: a.symbol, effectiveDate: a.effectiveDate, ratio: +a.ratio });
for (const p of load("prices_daily")) {
  (ds.prices[p.symbol] ??= {})[p.date] = +p.close;
  if (p.dividendPerShare != null) (ds.dividends[p.symbol] ??= {})[p.date] = +p.dividendPerShare;
}
for (const f of load("fx_daily")) ds.fx[f.date] = +f.rate;
const ctx = buildContext(ds);

let fails = 0, checks = 0;
const ok = (cond: boolean, msg: string) => { checks++; if (!cond) { fails++; console.log("FAIL", msg); } };
const near = (a: number | null, b: number | null, tol: number, msg: string) => ok(a != null && b != null && Math.abs(a - b) <= tol, `${msg}: got ${a} want ${b} (tol ${tol})`);

// 1. Parity
const acc = (b: string) => (b === "ALL" ? undefined : [b === "IBKR" ? "IBKR" : "INDMONEY_ALPACA"]);
const worst = { irr: 0, money: 0, ret: 0 };
for (const g of golden) {
  const accounts = acc(g.br);
  const r = run(ctx, g.start, g.end, { accounts, symbols: g.tk === "ALL" ? undefined : [g.tk], currency: g.cur, dividends: !!g.div });
  const tag = `${g.cur}/${g.br}/div${g.div}/${g.key}/${g.tk}`;
  ok(r.hasData === g.hasData, `${tag} hasData`);
  if (!g.hasData) continue;
  const mtol = Math.max(1, Math.abs(g.V1) * 2e-6) * (g.cur === "INR" ? 90 : 1);
  near(r.V1, g.V1, mtol, `${tag} V1`); near(r.V0, g.V0, mtol, `${tag} V0`); near(r.net, g.net, mtol, `${tag} net`);
  for (const k of ["pf", "SPY", "QQQ"] as const) {
    const a = r[k], b = g[k];
    if (b.irr == null || a.irr == null) ok(a.irr === b.irr, `${tag} ${k} irr null-parity`);
    else { near(a.irr, b.irr, 1e-4, `${tag} ${k} irr`); worst.irr = Math.max(worst.irr, Math.abs(a.irr - b.irr)); }
    near(a.profit, b.profit, mtol, `${tag} ${k} profit`); worst.money = Math.max(worst.money, Math.abs(a.profit - b.profit));
    if (b.ret != null) { near(a.ret, b.ret, 1e-4 * Math.max(1, Math.abs(b.ret)), `${tag} ${k} ret`); worst.ret = Math.max(worst.ret, Math.abs((a.ret ?? 0) - b.ret) / Math.max(1, Math.abs(b.ret))); }
    if (b.moic != null) near(a.moic, b.moic, 1e-4, `${tag} ${k} moic`);
  }
}
console.log(`parity: ${golden.length} scenarios, worst IRR dev ${(worst.irr * 100).toFixed(5)} pp, worst money dev ${worst.money.toFixed(2)}, worst ret dev (relative) ${(worst.ret * 100).toFixed(5)}%`);

// 2. Headline fixtures (published, rounded values)
const heads: [string, string[] | undefined, string, string, "USD" | "INR", number, number, number, number, number][] = [
  ["Both SI USD", undefined, "SI", "2026-09-18", "USD", 36.01, 18.86, 27.18, 129163, 253654],
  ["INDmoney SI USD", ["INDMONEY_ALPACA"], "SI", "2026-09-18", "USD", 36.55, 19.06, 27.21, 126834, 211313],
  ["IBKR SI USD", ["IBKR"], "SI", "2026-09-18", "USD", 16.2, 13.84, 26.2, 2329, 42341],
  ["Both YTD USD", undefined, "2025-12-31", "2026-09-18", "USD", 13.11, 15.72, 24.41, 18940, 253654],
  ["Both 1Y USD", undefined, "2025-09-18", "2026-09-18", "USD", 12.27, 14.41, 20.91, 23845, 253654],
  ["Both SI INR", undefined, "SI", "2026-09-18", "INR", 42.15, 24.37, 32.99, 13.4e6, 24.3e6],
];
for (const [n, accounts, s, e, cur, pf, spy, qqq, pnl, end] of heads) {
  const r = run(ctx, s === "SI" ? inceptionStart(ctx, accounts) : s, e, { accounts, currency: cur });
  near(r.pf.irr! * 100, pf, 0.006, `${n} pf`); near(r.SPY.irr! * 100, spy, 0.006, `${n} SPY`); near(r.QQQ.irr! * 100, qqq, 0.006, `${n} QQQ`);
  near(r.pf.profit, pnl, cur === "INR" ? 5e5 : 1, `${n} P&L`); near(r.V1, end, cur === "INR" ? 5e5 : 1, `${n} end`);
}

// 3. Lots
const book = buildLots(ds);
const snaps = load("position_snapshots");
const openBy = new Map<string, number>();
for (const l of book.open) openBy.set(`${l.account}|${l.symbol}`, (openBy.get(`${l.account}|${l.symbol}`) ?? 0) + l.qty);
for (const s of snaps) near(openBy.get(`${s.account}|${s.symbol}`) ?? 0, +s.qty, 5e-6, `lots vs snapshot ${s.account}|${s.symbol}`);
ok([...openBy.keys()].every((k) => snaps.some((s: any) => `${s.account}|${s.symbol}` === k)), "no open lots outside snapshots");
const full = run(ctx, inceptionStart(ctx), ctx.asof);
const realised = book.disposals.reduce((a, d) => a + d.gain, 0);
const lastIdx = ctx.dates.length - 1;
const unreal = book.open.reduce((a, l) => a + l.qty * (ctx.px[l.symbol][lastIdx] - l.costPerUnit - l.feePerUnit), 0);
near(realised + unreal, full.pf.profit, 0.01, "realised + unrealised == total P&L");
ok(book.disposals.length > 0 && book.disposals.every((d) => d.holdingDays >= 0 && d.qty > 0), "disposals well-formed");
console.log(`lots: ${book.open.length} open, ${book.disposals.length} disposals, realised ${realised.toFixed(2)}, unrealised ${unreal.toFixed(2)}, total ${full.pf.profit.toFixed(2)}`);

// 4. Annualisation flag, split sanity, oversell guard
ok(run(ctx, "2026-08-18", "2026-09-18").annualised === false, "1M not annualised");
ok(run(ctx, inceptionStart(ctx), ctx.asof).annualised === true, "SI annualised");
ok(symbolsOf(ctx).length === 12, "12 traded symbols");
let threw = false;
try { buildLots({ ...ds, trades: [...ds.trades, { account: "IBKR", symbol: "AMZN", side: "SELL", qty: 9999, price: 1, fee: 0, tradeDate: "2026-09-01" }] }); } catch { threw = true; }
ok(threw, "oversell throws");

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
