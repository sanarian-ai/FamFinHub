// Server-side loader for the Crypto Portfolio screens, mirroring india-data.ts's shape (60s
// in-process memo, buildLots over an isActive-derived lotAccounts list) but scoped to crypto
// accounts via loadCryptoDataset. Single holder (Sangeeth) and single account today, so unlike
// India there's no channel/holder combiner here — a "by symbol" cut (BTC vs ETH) is done directly
// with views.ts's stockRows(), same as every other channel.
import { prisma } from "@/lib/prisma";
import { buildContext, buildLots, type Ctx, type Dataset, type LotBook } from "./engine";
import { loadCryptoDataset, CRYPTO_BROKERS } from "./crypto-load";

export type CryptoPortfolioData = {
  ds: Dataset; ctx: Ctx; book: LotBook; empty: boolean;
  accounts: string[]; // every crypto account (CoinDCX today)
  lotAccounts: string[]; // accounts eligible for buildLots() — same isActive-derived pattern as India;
  // no closed/synthetic crypto accounts exist yet, so this equals `accounts` today.
  lotsError: string | null;
};

let memo: { at: number; v: CryptoPortfolioData } | null = null;
const TTL_MS = 60_000;

export async function getCryptoPortfolioData(): Promise<CryptoPortfolioData> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.v;
  const [ds, accs] = await Promise.all([
    loadCryptoDataset(prisma),
    prisma.portfolioAccount.findMany({ where: { broker: { in: CRYPTO_BROKERS } }, select: { key: true, isActive: true } }),
  ]);
  const accounts = accs.map((a) => a.key);
  const lotAccounts = accs.filter((a) => a.isActive).map((a) => a.key);
  const empty = ds.trades.length === 0 || Object.keys(ds.prices).length === 0;
  const ctx = buildContext(ds);
  let book: LotBook = { open: [], disposals: [] };
  let lotsError: string | null = null;
  if (!empty) {
    try { book = buildLots(ds, lotAccounts); } catch (e) { lotsError = e instanceof Error ? e.message : String(e); }
  }
  const v: CryptoPortfolioData = { ds, ctx, book, empty, accounts, lotAccounts, lotsError };
  memo = { at: Date.now(), v };
  return v;
}
