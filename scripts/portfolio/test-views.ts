// View-model tests over the seed data. Run: npx tsx scripts/portfolio/test-views.ts
import fs from "node:fs";
import path from "node:path";
import { buildContext, buildLots, inceptionStart, type Dataset } from "../../src/lib/portfolio/engine";
import { decompose, disposalRows, periodDefs, positions, runPeriod, stockRows } from "../../src/lib/portfolio/views";

const seed = path.join(process.cwd(), "prisma", "seed-data", "portfolio");
const load = (n: string) => JSON.parse(fs.readFileSync(path.join(seed, `${n}.json`), "utf8"));
const ds: Dataset = { trades: [], actions: [], prices: {}, dividends: {}, fx: {} };
for (const x of load("transactions")) ds.trades.push({ account: x.account, symbol: x.symbol, side: x.side, qty: +x.qty, price: +x.price, fee: +x.fee, tradeDate: x.tradeDate });
for (const a of load("corporate_actions")) ds.actions.push({ symbol: a.symbol, effectiveDate: a.effectiveDate, ratio: +a.ratio });
for (const p of load("prices_daily")) { (ds.prices[p.symbol] ??= {})[p.date] = +p.close; if (p.dividendPerShare != null) (ds.dividends[p.symbol] ??= {})[p.date] = +p.dividendPerShare; }
for (const f of load("fx_daily")) ds.fx[f.date] = +f.rate;
const ctx = buildContext(ds), book = buildLots(ds);

let fails = 0, checks = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { fails++; console.log("FAIL", m); } };
const near = (a: number, b: number, tol: number, m: string) => ok(Math.abs(a - b) <= tol, `${m}: got ${a} want ${b}`);

const defs = periodDefs(ctx);
const keys = defs.map((d) => d.key);
ok(["1M", "3M", "6M", "YTD", "1Y", "2Y", "3Y", "SI", "CY2022", "CY2026", "FY2023", "FY2027"].every((k) => keys.includes(k)), `period keys ${keys.join(",")}`);
ok(defs.every((d) => d.start >= inceptionStart(ctx) && d.end > d.start && d.end <= ctx.asof), "periods clamped to [inception, asof]");
ok(defs.find((d) => d.key === "CY2026")!.end === ctx.asof, "current CY is YTD");

const pos = positions(ctx, book);
ok(pos.rows.length === 9, `9 open positions (got ${pos.rows.length}: ${pos.rows.map((r) => r.symbol).join(",")})`);
near(pos.totalValue, 253654, 1, "total value");
near(pos.rows.reduce((a, r) => a + r.weight, 0), 1, 1e-9, "weights sum to 1");
ok(pos.rows[0].symbol === "META" && Math.abs(pos.rows[0].weight - 0.342) < 0.001, "META is 34.2%");
ok(pos.rows.every((r) => r.lots.length > 0 && r.lots.every((l) => l.qty >= 1e-5)), "no dust lots");
near(pos.totalValue - pos.totalCost, 121329.7, 0.05, "unrealised gain");

const si = { start: inceptionStart(ctx), end: ctx.asof };
const dec = decompose(ctx, si, {});
near(dec.price + dec.dividends + dec.fx, dec.total, 1e-6, "decomposition sums to INR gain");
ok(dec.fx > 0 && dec.fxRateEnd > dec.fxRateStart, "FX effect positive when INR weakened");
const inr = runPeriod(ctx, si, { currency: "INR" });
near(dec.total, inr.pf.profit, 1e-6, "decomposition total equals engine INR profit");

const stocks = stockRows(ctx, si, {});
const exited = stocks.filter((s) => s.status === "exited").map((s) => s.symbol).sort();
ok(JSON.stringify(exited) === JSON.stringify(["AAPL", "ADBE", "BKNG"]), `exited = ${exited}`);
const aapl = stocks.find((s) => s.symbol === "AAPL")!;
ok(aapl.d1 === "2024-10-31", `AAPL measured to exit date (${aapl.d1})`);

const disp = disposalRows(book);
ok(disp.length === 4 && disp.every((d) => !d.isLong && d.daysShort > 0), "all 4 disposals are short-term (ADBE x2, AAPL, BKNG)");
ok(disp.find((d) => d.symbol === "ADBE" && d.openDate === "2022-09-16")!.daysShort === 42, "ADBE lot 42 days short of 24 months");

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
