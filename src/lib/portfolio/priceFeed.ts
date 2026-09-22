// Free, unofficial daily-close price feed (Yahoo Finance's public chart endpoint) for the manual
// "Refresh prices" button and the daily scheduled sync. No API key, no SLA — treated accordingly:
// every call is independent and failure-tolerant. A symbol Yahoo doesn't cover, or that errors,
// returns null and the caller leaves the existing last-known price untouched (see the /api/portfolio/
// prices/refresh route). Never throws, never invents a price.
//
// Scope: STOCK/ETF securities only. Indian mutual fund NAVs (the 4 Kabir PMS liquid/arbitrage funds)
// are not exchange-quoted instruments Yahoo's chart endpoint covers, so they're excluded here rather
// than silently failing on every run — see MANIFEST.md / kabir-pms-p2-log.md for that known gap.

const SESSION_TZ: Record<"NSE" | "US", string> = { NSE: "Asia/Kolkata", US: "America/New_York" };

const sessionDate = (epochSeconds: number, market: "NSE" | "US") =>
  new Intl.DateTimeFormat("en-CA", { timeZone: SESSION_TZ[market], year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(epochSeconds * 1000));

/** NSE-listed security symbol -> Yahoo's `.NS` ticker. US symbols are used as-is. */
export function yahooSymbol(symbol: string, market: "NSE" | "US"): string {
  return market === "NSE" ? `${symbol}.NS` : symbol;
}

export type PriceFetchResult = { symbol: string; date: string; close: number } | null;

/**
 * Fetches the latest available daily close for one symbol. Best-effort: any non-2xx response,
 * malformed body, or missing close data returns null rather than throwing, so a caller looping
 * over many symbols never has one bad ticker abort the rest.
 */
export async function fetchLatestClose(symbol: string, market: "NSE" | "US"): Promise<PriceFetchResult> {
  const yq = yahooSymbol(symbol, market);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yq)}?interval=1d&range=5d`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FamilyFinanceHub/1.0)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = await res.json().catch(() => null);
    const result = body?.chart?.result?.[0];
    const timestamps: number[] | undefined = result?.timestamp;
    const closes: (number | null)[] | undefined = result?.indicators?.quote?.[0]?.close;
    if (!timestamps?.length || !closes?.length) return null;
    // Walk back from the most recent candle to the last one with a non-null close (today's
    // candle can be null/partial intraday, or the market may be closed with a trailing gap).
    for (let i = timestamps.length - 1; i >= 0; i--) {
      const c = closes[i];
      if (c != null && Number.isFinite(c) && c > 0) {
        return { symbol, date: sessionDate(timestamps[i], market), close: c };
      }
    }
    return null;
  } catch {
    return null; // network error, timeout, abort — same "no price this time" outcome as any other miss
  }
}

/** Fetches every symbol independently and in parallel; one failure never affects the others. */
export async function fetchLatestCloses(securities: { symbol: string; market: "NSE" | "US" }[]): Promise<Map<string, PriceFetchResult>> {
  const out = new Map<string, PriceFetchResult>();
  await Promise.all(
    securities.map(async (s) => {
      out.set(s.symbol, await fetchLatestClose(s.symbol, s.market));
    })
  );
  return out;
}
