// Free, unofficial daily-close price feed (CoinGecko's public API) for crypto (BTC/ETH on CoinDCX).
// Same failure-tolerant contract as priceFeed.ts (Yahoo Finance, stocks/ETFs) and amfiNav.ts (MF
// NAVs): no API key, no SLA, a symbol that errors or isn't covered returns null and the caller
// leaves the existing last-known price untouched. Never throws, never invents a price.
//
// CoinGecko coin-id mapping is hardcoded here (2 symbols only, no discovery needed): BTC -> "bitcoin",
// ETH -> "ethereum". A third crypto symbol would need its CoinGecko id added to COINGECKO_ID.
//
// Free-tier limit (confirmed empirically 2026-09-26): the /market_chart/range endpoint only serves
// the last 365 days from "now" — a request for anything older gets error_code 10012. This is why the
// CoinDCX ingestion (coindcx/seed.ts) backfills full daily history only from that rolling cutoff
// forward, and uses each trade's own execution price as a single-day mark for anything older (same
// "trade-price-derived mark" pattern the IIFL ingestion used when a full OHLC backfill wasn't
// affordable — see india-portfolio-build-brief.md's IIFL price-backfill section). This module only
// covers the "latest close" case (the daily refresh / manual button); the one-time historical
// backfill lives in the seed script, not here.

const COINGECKO_ID: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum" };

export type PriceFetchResult = { symbol: string; date: string; close: number } | null;

/** UTC calendar date for "today", matching coindcx_order_history's UTC session-date convention
 *  (crypto trades 24/7, so there's no exchange-local session to convert to — see ingest.ts). */
const todayUtc = () => new Date().toISOString().slice(0, 10);

/**
 * Fetches the current INR price for one crypto symbol via CoinGecko's /simple/price endpoint
 * (no auth, no historical range limit — always "now"). Returns null on any non-2xx response,
 * network error, or malformed body, same contract as fetchLatestClose in priceFeed.ts.
 */
export async function fetchLatestCryptoClose(symbol: string): Promise<PriceFetchResult> {
  const id = COINGECKO_ID[symbol];
  if (!id) return null;
  try {
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=inr`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const close = body?.[id]?.inr;
    if (typeof close !== "number" || !Number.isFinite(close) || close <= 0) return null;
    return { symbol, date: todayUtc(), close };
  } catch {
    return null;
  }
}

/** Fetches every symbol independently and in parallel; one failure never affects the others. */
export async function fetchLatestCryptoCloses(symbols: string[]): Promise<Map<string, PriceFetchResult>> {
  const out = new Map<string, PriceFetchResult>();
  await Promise.all(
    symbols.map(async (s) => {
      out.set(s, await fetchLatestCryptoClose(s));
    })
  );
  return out;
}
