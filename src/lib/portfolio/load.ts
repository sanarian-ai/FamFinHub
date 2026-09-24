// Loads the engine Dataset from Postgres. The only DB-touching piece of the engine layer.
// Lean selects (no joins on the ~15k price rows): symbols are resolved through an id map.
//
// Scoped to exclude every INR-native broker (Kabir PMS, CAMS mutual funds): this engine
// (buildContext/run/buildLots in engine.ts) is USD/US-market-only — no INR handling, no NSE
// trading calendar or currency conversion in positions()'s totalValue, and it assumes every
// symbol that shows up in a trade also has PriceDaily rows in the convention this engine expects.
// Letting an INR account's trades into ctx.trades here either crashes run()'s px[symbol][i]
// lookups for any account-unscoped call (e.g. the Overview screen's "all accounts" view) the
// moment an INR-only symbol shows up in the combined symbol set, or — the bug found and fixed
// 2026-09-24 — silently sums raw INR position values into totalValue alongside raw USD ones with
// no currency conversion, inflating "US portfolio" totals by whatever the mixed-in INR accounts
// are worth (this is exactly what happened once MF_FOLIO accounts existed: the exclude-list here
// was never extended to cover them, so every mutual fund's INR value was added into what every
// caller — including the retirement net-worth "international equity" live-wire — treated as a
// pure-USD total). Kabir and MF get their own INR-native handling elsewhere (see
// kabir-pms-p2-log.md "Engine layer" (P3) for Kabir; src/app/portfolio/mf/page.tsx for MF) — not
// this one. INR_NATIVE_BROKERS must be extended whenever a new INR-denominated broker is added
// (e.g. IIFL) — an include-list of USD brokers would be more failure-safe than this exclude-list,
// but is left as a follow-up since it touches the same query shape either way.
import type { PrismaClient, PortfolioBroker } from "@prisma/client";
import type { Dataset } from "./engine";

const INR_NATIVE_BROKERS: PortfolioBroker[] = ["KABIR_PMS", "MF_FOLIO"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function loadDataset(prisma: PrismaClient): Promise<Dataset> {
  const [secs, accs, tx, acts, prices, fx] = await Promise.all([
    prisma.security.findMany({ select: { id: true, symbol: true } }),
    prisma.portfolioAccount.findMany({ select: { id: true, key: true } }),
    prisma.portfolioTransaction.findMany({ where: { account: { broker: { notIn: INR_NATIVE_BROKERS } } }, select: { accountId: true, securityId: true, side: true, qty: true, price: true, fee: true, tradeDate: true }, orderBy: [{ tradeDate: "asc" }, { execTs: "asc" }] }),
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
