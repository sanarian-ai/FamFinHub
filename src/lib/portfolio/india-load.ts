// Loads the engine Dataset scoped to India-domiciled accounts: direct equity (Zerodha, Kotak
// Securities, IIFL demat), PMS (Kabir Capital PMS, the closed KCV/KFV/Unifi vehicles) and mutual
// funds (CAMS/KFintech folios). Mirrors load.ts's shape exactly, but as an INCLUDE-list rather
// than load.ts's EXCLUDE-list, since India is the minority of accounts today and a new India
// broker should have to be added here deliberately rather than leaking in by omission.
//
// Everything this loader returns is already INR: trades, prices and dividends alike, so unlike
// load.ts this dataset carries no `fx` table at all — engine.run()'s fxAt() only multiplies by
// ctx.fx when a caller explicitly passes `currency: "INR"` against a USD-denominated Ctx; a caller
// over this dataset never passes that option; and every conversion of a US-vs-India combined
// figure into one currency happens one level up (see the /portfolio/all combiner), not here.
//
// Prices and corporate actions are NOT broker-filtered (same as load.ts) — a Security has no
// owning broker, only trades and snapshots do — so this naturally picks up the 4 Nifty TRI
// benchmark securities (NIFTY50TRI/NIFTY500TRI/NIFMC150TRI/NIFSC250TRI) alongside every India
// equity/PMS/MF security's price history.
import type { PrismaClient, PortfolioBroker } from "@prisma/client";
import type { Dataset } from "./engine";
import { closedVehicleData } from "./closedVehicles";

export const INDIA_BROKERS: PortfolioBroker[] = [
  "ZERODHA", "KOTAK_SECURITIES", "IIFL_DEMAT", "KABIR_PMS", "MF_FOLIO",
  "KABIR_CAPITAL_VENTURES", "KABIR_FINANCIAL_VENTURES", "UNIFI_PMS",
];

const iso = (d: Date) => d.toISOString().slice(0, 10);

export type IndiaDataset = { ds: Dataset; closedVehicleSymbols: Set<string> };

export async function loadIndiaDataset(prisma: PrismaClient): Promise<IndiaDataset> {
  const [secs, accs, tx, acts, prices] = await Promise.all([
    prisma.security.findMany({ select: { id: true, symbol: true } }),
    prisma.portfolioAccount.findMany({ select: { id: true, key: true, isActive: true } }),
    prisma.portfolioTransaction.findMany({ where: { account: { broker: { in: INDIA_BROKERS } } }, select: { accountId: true, securityId: true, side: true, qty: true, price: true, fee: true, tradeDate: true }, orderBy: [{ tradeDate: "asc" }, { execTs: "asc" }] }),
    prisma.corporateAction.findMany({ select: { securityId: true, type: true, effectiveDate: true, ratio: true } }),
    prisma.priceDaily.findMany({ select: { securityId: true, date: true, close: true, dividendPerShare: true } }),
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

  // Closed-vehicle "value at cost" fix (2026-09-26 — see closedVehicles.ts's header for the full
  // background). Symbols whose entire trade history sits inside isActive:false accounts get their
  // DB-loaded price series REPLACED entirely by a derived hold-at-cost series, instead of the flat
  // Rs 0.01 placeholder previously ingested for them — this is the sole place that placeholder is
  // consumed downstream (buildContext() only ever reads ds.prices), so overriding it here fixes
  // every screen that prices these symbols (Overview, PMS page, India rollup, All Assets) at once.
  const inactiveKeys = new Set(accs.filter((a) => !a.isActive).map((a) => a.key));
  const { symbols: closedVehicleSymbols, prices: derivedPrices } = closedVehicleData(ds.trades, inactiveKeys);
  for (const s of closedVehicleSymbols) ds.prices[s] = derivedPrices[s];

  return { ds, closedVehicleSymbols };
}
