// Ingest tests against a DISPOSABLE database seeded by scripts/portfolio/seed.ts.
// NEVER point at production: this writes test rows. Run: DATABASE_URL=<scratch> npx tsx scripts/portfolio/test-ingest.ts
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ingestPortfolio, shapeError } from "../../src/lib/portfolio/ingest";

if (/supabase|render\.com/i.test(process.env.DATABASE_URL ?? "")) { console.error("Refusing to run against a hosted database. Use a disposable local Postgres."); process.exit(2); }
const p = new PrismaClient();
const dir = path.join(process.cwd(), "prisma", "seed-data", "portfolio");
const seedDir = fs.existsSync(dir) ? dir : path.join(process.cwd(), "prisma", "seed");
const L = (n: string) => JSON.parse(fs.readFileSync(path.join(seedDir, `${n}.json`), "utf8"));
let fails = 0, checks = 0;
const ok = (c: boolean, m: string) => { checks++; if (!c) { fails++; console.log("FAIL", m); } };

(async () => {
  const tx = L("transactions").map((t: any) => ({ account: t.account, symbol: t.symbol, side: t.side, qty: t.qty, price: t.price, fee: t.fee, execTs: t.execTs, tradeDate: t.tradeDate, source: t.source, brokerRef: t.brokerRef }));
  const snaps = L("position_snapshots").map((s: any) => ({ account: s.account, symbol: s.symbol, asOf: s.asOf, qty: s.qty }));
  const count = () => Promise.all([p.portfolioTransaction.count(), p.portfolioReviewItem.count(), p.priceDaily.count()]);

  // 1. Replay of all history: zero inserts, all 12 positions reconcile, no review items
  let r = await ingestPortfolio(p, { transactions: tx, positionSnapshots: snaps });
  ok(r.results.transactions.inserted === 0 && r.results.transactions.skipped === 61, `replay inserted ${r.results.transactions.inserted} skipped ${r.results.transactions.skipped}`);
  ok(r.reconciliation.length === 12 && r.reconciliation.every((x) => x.ok), "replay reconciles 12/12");
  ok(r.reviewItemsOpened === 0, "replay opens no review items");

  // 2. New IBKR trade + matching snapshot; replay is a no-op
  const newTx = { account: "IBKR", symbol: "UBER", side: "BUY", qty: 1, price: 70.5, fee: 1, execTs: "2026-09-21T13:31:00Z", source: "ibkr_api", brokerRef: "TEST.0001.01.01" };
  r = await ingestPortfolio(p, { transactions: [newTx], positionSnapshots: [{ account: "IBKR", symbol: "UBER", asOf: "2026-09-21", qty: "137.3747" }] });
  ok(r.results.transactions.inserted === 1 && r.importBatchId !== null, "new trade inserted with batch");
  ok(r.reconciliation.find((x) => x.account === "IBKR" && x.symbol === "UBER")?.ok === true, "UBER reconciles after new trade + snapshot");
  r = await ingestPortfolio(p, { transactions: [newTx] });
  ok(r.results.transactions.inserted === 0 && r.results.transactions.skipped === 1, "new trade replay inserts 0");
  ok((await p.portfolioTransaction.findFirst({ where: { brokerRef: "TEST.0001.01.01" } }))?.tradeDate.toISOString().slice(0, 10) === "2026-09-21", "tradeDate derived (ET)");

  // 3. Mismatch opens one review item; repeating does not duplicate; correcting resolves it
  const bad = { positionSnapshots: [{ account: "IBKR", symbol: "AMZN", asOf: "2026-09-21", qty: 42 }] };
  r = await ingestPortfolio(p, bad);
  ok(r.reconciliation.some((x) => x.symbol === "AMZN" && !x.ok) && r.reviewItemsOpened === 1, "mismatch opens review item");
  r = await ingestPortfolio(p, bad);
  ok(r.reviewItemsOpened === 0 && (await p.portfolioReviewItem.count({ where: { type: "UNITS_MISMATCH", status: "open" } })) === 1, "mismatch not duplicated");
  r = await ingestPortfolio(p, { positionSnapshots: [{ account: "IBKR", symbol: "AMZN", asOf: "2026-09-21", qty: 41 }] });
  ok((await p.portfolioReviewItem.count({ where: { type: "UNITS_MISMATCH", status: "open" } })) === 0 && (await p.portfolioReviewItem.count({ where: { type: "UNITS_MISMATCH", status: "resolved" } })) === 1, "corrected snapshot resolves item");

  // 4. Rejections: every bad row reported, none inserted, review items created once
  const base = { qty: 1, price: 10, side: "BUY", account: "IBKR", symbol: "AMZN", execTs: "2026-09-22T14:00:00Z", source: "ibkr_api" };
  const badRows = [
    { ...base, brokerRef: "R1", account: "NOPE" }, { ...base, brokerRef: "R2", symbol: "ZZZZ" }, { ...base, brokerRef: "R3", side: "HOLD" },
    { ...base, brokerRef: "R4", qty: 0 }, { ...base, brokerRef: undefined }, { ...base, brokerRef: "R6", execTs: "2026-08-07T01:00:00Z", tradeDate: "2026-08-07" },
    { ...base, brokerRef: "R7", price: "abc" }, { ...base, brokerRef: "R8", source: "email" },
  ];
  const before = await count();
  r = await ingestPortfolio(p, { transactions: badRows });
  ok(r.results.transactions.rejected.length === 8 && r.results.transactions.inserted === 0, `all 8 bad rows rejected (${r.results.transactions.rejected.length})`);
  ok((await p.portfolioReviewItem.count()) === before[1] + 8, "rejects became 8 review items")
  const n1 = await p.portfolioReviewItem.count();
  await ingestPortfolio(p, { transactions: badRows });
  ok((await p.portfolioReviewItem.count()) === n1, "repeat rejects do not duplicate review items");

  // 5. dryRun writes nothing
  const b2 = await count();
  r = await ingestPortfolio(p, { dryRun: true, transactions: [{ ...base, brokerRef: "DRY1" }, { ...base, brokerRef: "DRY2", account: "NOPE" }], prices: [{ symbol: "AMZN", date: "2026-09-21", close: 250 }] });
  const a2 = await count();
  ok(JSON.stringify(b2) === JSON.stringify(a2) && (r.results.transactions as any).valid === 1 && r.results.transactions.rejected.length === 1, "dryRun validates without writing");

  // 6. Prices: insert, replay skips, overwrite corrects; fx same
  const pr = [{ symbol: "AMZN", date: "2026-09-21", close: 250.5 }, { symbol: "SPY", date: "2026-09-21", close: 700, dividendPerShare: 1.5 }];
  r = await ingestPortfolio(p, { prices: pr, fx: [{ pair: "USDINR", date: "2026-09-21", rate: 88.1 }] });
  ok(r.results.prices.inserted === 2 && r.results.fx.inserted === 1, "prices/fx inserted");
  r = await ingestPortfolio(p, { prices: pr, fx: [{ pair: "USDINR", date: "2026-09-21", rate: 88.1 }] });
  ok(r.results.prices.inserted === 0 && r.results.prices.skipped === 2 && r.results.fx.skipped === 1, "prices/fx replay skipped");
  r = await ingestPortfolio(p, { overwrite: true, prices: [{ symbol: "AMZN", date: "2026-09-21", close: 251 }], fx: [{ pair: "USDINR", date: "2026-09-21", rate: 88.2 }] });
  const px = await p.priceDaily.findFirst({ where: { security: { symbol: "AMZN" }, date: new Date("2026-09-21T00:00:00Z") } });
  const fx = await p.fxDaily.findFirst({ where: { pair: "USDINR", date: new Date("2026-09-21T00:00:00Z") } });
  ok(Number(px?.close) === 251 && Number(fx?.rate) === 88.2, "overwrite corrects price and fx");
  r = await ingestPortfolio(p, { prices: [{ symbol: "AMZN", date: "2026-09-22", close: -1 }, { symbol: "AMZN", date: "2026/09/22", close: 1 }] });
  ok(r.results.prices.rejected.length === 2, "bad prices rejected");

  // 7. New security and its first trade in one payload
  r = await ingestPortfolio(p, { securities: [{ symbol: "TSLA", name: "Tesla Inc." }], transactions: [{ account: "IBKR", symbol: "TSLA", side: "BUY", qty: 2, price: 300, fee: 0, execTs: "2026-09-22T14:00:00Z", source: "ibkr_api", brokerRef: "TEST.TSLA.1" }] });
  ok(r.results.securities.inserted === 1 && r.results.transactions.inserted === 1, "new security + first trade");

  // 8. Timezone: IST evening trade lands on the US session date
  r = await ingestPortfolio(p, { transactions: [{ account: "INDMONEY_ALPACA", symbol: "MSFT", side: "BUY", qty: 0.1, price: 400, fee: 0, execTs: "2026-01-15T14:30:00Z", tradeDate: "2026-01-15", source: "indmoney_report", brokerRef: "TEST.TZ.1" }] });
  ok(r.results.transactions.inserted === 1, "IST-evening trade accepted with ET tradeDate");

  // 9. Shape errors
  ok(shapeError(null) !== null && shapeError({}) !== null && shapeError({ transactions: "x" }) !== null && shapeError({ prices: [], source: "email", fx: [1] }) !== null && shapeError({ fx: [{}] }) === null, "shapeError cases");

  console.log(`${checks - fails}/${checks} checks passed`);
  process.exit(fails ? 1 : 0);
})().finally(() => p.$disconnect());
