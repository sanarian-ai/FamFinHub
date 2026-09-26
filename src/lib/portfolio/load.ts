// Loads the engine Dataset from Postgres. The only DB-touching piece of the engine layer.
// Lean selects (no joins on the ~15k price rows): symbols are resolved through an id map.
//
// Scoped to USD brokers only (an include-list, not an exclude-list): this engine
// (buildContext/run/buildLots in engine.ts) is USD/US-market-only — no INR handling, no NSE
// trading calendar or currency conversion in positions()'s totalValue, and it assumes every
// symbol that shows up in a trade also has PriceDaily rows in the convention this engine expects.
// Letting an INR account's trades into ctx.trades here either crashes run()'s px[symbol][i]
// lookups for any account-unscoped call (e.g. the Overview screen's "all accounts" view) the
// moment an INR-only symbol shows up in the combined symbol set, or silently sums raw INR position
// values into totalValue alongside raw USD ones with no currency conversion, inflating "US
// portfolio" totals by whatever the mixed-in INR accounts are worth.
//
// This was an exclude-list (INR_NATIVE_BROKERS) through 2026-09-25 and it bit three times: once
// when MF_FOLIO accounts were added and never excluded (2026-09-24 fix), again when
// KABIR_CAPITAL_VENTURES/KABIR_FINANCIAL_VENTURES/UNIFI_PMS were added to India's PMS channel
// without being excluded (2026-09-24 fix, same day), and a third time when IIFL_DEMAT_RIA gained
// its first real trade history (2026-09-25 IIFL ingestion) — the exclude-list's own comment named
// IIFL as the next risk and it still wasn't caught until "Total tracked" on /portfolio/all jumped
// to ~85Cr from India equity being counted as if every rupee were a dollar. Converted to this
// include-list on the third recurrence: a new India broker now has to be silently omitted from
// BOTH the enum's own doc comment AND this list to leak in, instead of just this one. Kabir and MF
// get their own INR-native handling elsewhere (see kabir-pms-p2-log.md "Engine layer" (P3) for
// Kabir; src/app/portfolio/mf/page.tsx for MF) — not this one.
import type { PrismaClient, PortfolioBroker } from "@prisma/client";
import type { Dataset } from "./engine";

// USD-denominated brokers only. A new broker is USD-native ONLY if trades on it are actually
// priced and settled in USD (US-listed shares) — everything else (any Indian broker/demat/PMS,
// present or future) must NOT be added here, or its INR trades corrupt the US book's totals as
// described above.
export const USD_BROKERS: PortfolioBroker[] = ["INDMONEY_ALPACA", "IBKR"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function loadDataset(prisma: PrismaClient): Promise<Dataset> {
  const [secs, accs, tx, acts, prices, fx] = await Promise.all([
    prisma.security.findMany({ select: { id: true, symbol: true } }),
    prisma.portfolioAccount.findMany({ select: { id: true, key: true } }),
    prisma.portfolioTransaction.findMany({ where: { account: { broker: { in: USD_BROKERS } } }, select: { accountId: true, securityId: true, side: true, qty: true, price: true, fee: true, tradeDate: true }, orderBy: [{ tradeDate: "asc" }, { execTs: "asc" }] }),
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
