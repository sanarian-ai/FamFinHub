// Loads the engine Dataset from Postgres. The only DB-touching piece of the engine layer.
// Lean selects (no joins on the ~15k price rows): symbols are resolved through an id map.
//
// Scoped to exclude the Kabir PMS (India equity) account: this engine (buildContext/run/buildLots
// in engine.ts) is USD/US-market-only — no INR handling, no NSE trading calendar, and it assumes
// every symbol that shows up in a trade also has PriceDaily rows (Kabir currently has transactions
// but no prices, since only the daily price-sync writes those). Letting Kabir trades into ctx.trades
// here crashes run()'s px[symbol][i] lookups for any account-unscoped call (e.g. the Overview screen's
// "all accounts" view) the moment a Kabir-only symbol shows up in the combined symbol set. Kabir gets
// its own INR-native engine pass — see kabir-pms-p2-log.md, "Engine layer" (P3) — not this one.
const KABIR_ACCOUNT_KEY = "KABIR_PMS_RIA";

import type { PrismaClient } from "@prisma/client";
import type { Dataset } from "./engine";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function loadDataset(prisma: PrismaClient): Promise<Dataset> {
  const [secs, accs, tx, acts, prices, fx] = await Promise.all([
    prisma.security.findMany({ select: { id: true, symbol: true } }),
    prisma.portfolioAccount.findMany({ select: { id: true, key: true } }),
    prisma.portfolioTransaction.findMany({ where: { account: { key: { not: KABIR_ACCOUNT_KEY } } }, select: { accountId: true, securityId: true, side: true, qty: true, price: true, fee: true, tradeDate: true }, orderBy: [{ tradeDate: "asc" }, { execTs: "asc" }] }),
    prisma.corporateAction.findMany({ select: { securityId: true, type: true, effectiveDate: true, ratio: true } }),
    prisma.priceDaily.findMany({ select: { securityId: true, date: true, close: true, dividendPerShare: true } }),
    prisma.fxDaily.findMany({ where: { pair: "USDINR" }, select: { date: true, rate: true } }),
  ]);
  const sym = new Map(secs.map((s) => [s.id, s.symbol]));
  const acc = new Map(accs.map((a) => [a.id, a.key]));
  const ds: Dataset = { trades: [], actions: [], prices: {}, dividends: {}, fx: {} };
  for (const x of tx) ds.trades.push({ account: acc.get(x.accountId)!, symbol: sym.get(x.securityId)!, side: x.side, qty: Number(x.qty), price: Number(x.price), fee: Number(x.fee), tradeDate: iso(x.tradeDate) });
  for (const a of acts) if (a.type === "SPLIT" || a.type === "REVERSE_SPLIT") ds.actions.push({ symbol: sym.get(a.securityId)!, effectiveDate: iso(a.effectiveDate), ratio: Number(a.ratio) });
  for (const p of prices) {
    const s = sym.get(p.securityId)!, d = iso(p.date);
    (ds.prices[s] ??= {})[d] = Number(p.close);
    if (p.dividendPerShare != null) (ds.dividends[s] ??= {})[d] = Number(p.dividendPerShare);
  }
  for (const f of fx) ds.fx[iso(f.date)] = Number(f.rate);
  return ds;
}
