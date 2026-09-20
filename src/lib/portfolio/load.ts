// Loads the engine Dataset from Postgres. The only DB-touching piece of the engine layer.
import type { PrismaClient } from "@prisma/client";
import type { Dataset } from "./engine";

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function loadDataset(prisma: PrismaClient): Promise<Dataset> {
  const [tx, acts, prices, fx] = await Promise.all([
    prisma.portfolioTransaction.findMany({ include: { account: { select: { key: true } }, security: { select: { symbol: true } } }, orderBy: [{ tradeDate: "asc" }, { execTs: "asc" }] }),
    prisma.corporateAction.findMany({ include: { security: { select: { symbol: true } } } }),
    prisma.priceDaily.findMany({ include: { security: { select: { symbol: true } } } }),
    prisma.fxDaily.findMany({ where: { pair: "USDINR" } }),
  ]);
  const ds: Dataset = { trades: [], actions: [], prices: {}, dividends: {}, fx: {} };
  for (const x of tx) ds.trades.push({ account: x.account.key, symbol: x.security.symbol, side: x.side, qty: Number(x.qty), price: Number(x.price), fee: Number(x.fee), tradeDate: iso(x.tradeDate) });
  for (const a of acts) if (a.type === "SPLIT" || a.type === "REVERSE_SPLIT") ds.actions.push({ symbol: a.security.symbol, effectiveDate: iso(a.effectiveDate), ratio: Number(a.ratio) });
  for (const p of prices) {
    const s = p.security.symbol, d = iso(p.date);
    (ds.prices[s] ??= {})[d] = Number(p.close);
    if (p.dividendPerShare != null) (ds.dividends[s] ??= {})[d] = Number(p.dividendPerShare);
  }
  for (const f of fx) ds.fx[iso(f.date)] = Number(f.rate);
  return ds;
}
