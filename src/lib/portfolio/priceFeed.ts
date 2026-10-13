// Free, unofficial daily-close price feed (Yahoo Finance's public chart endpoint) for the manual
// "Refresh prices" button and the daily scheduled sync. No API key, no SLA — treated accordingly:
// every call is independent and failure-tolerant. A symbol Yahoo doesn't cover, or that errors,
// returns null and the caller leaves the existing last-known price untouched (see the /api/portfolio/
// prices/refresh route). Never throws, never invents a price.
//
// Scope: STOCK/ETF securities only. Indian mutual fund NAVs (the 4 Kabir PMS liquid/arbitrage funds)
// are not exchange-quoted instruments Yahoo's chart endpoint covers, so they're excluded here rather
// than silently failing on every run — see MANIFEST.md / kabir-pms-p2-log.md for that known gap.

const SESSION_TZ: Record<"NSE" | "BSE" | "US", string> = { NSE: "Asia/Kolkata", BSE: "Asia/Kolkata", US: "America/New_York" };

const sessionDate = (epochSeconds: number, market: "NSE" | "BSE" | "US") =>
  new Intl.DateTimeFormat("en-CA", { timeZone: SESSION_TZ[market], year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(epochSeconds * 1000));

/**
 * Yahoo tickers that can't be derived mechanically from the stored symbol. A BSE-listed security is
 * stored by its numeric scrip code (e.g. "544937"), and Yahoo does NOT index newly-listed BSE scrips
 * by that code — `544937.BO` returns 404 — only by the exchange ticker. Verified 2026-10-06:
 * 544937 (National Stock Exchange of India Ltd, listed on BSE 2026-09-24) resolves only as `NSE.BO`.
 * Add an entry here whenever a BSE scrip-code security's refresh falls back to "no price".
 */
const YAHOO_TICKER_OVERRIDE: Record<string, string> = {
  "544937": "NSE.BO",
};

/**
 * Ordered Yahoo tickers to try for one security. NSE -> `.NS`, then `.BO` as a fallback: a security
 * recorded as NSE-listed that's actually BSE-only (e.g. INDUSINVIT, TRUECOLORS — `.NS` is a 404 for
 * both, `.BO` works) would otherwise never refresh. BSE -> override if any, else `.BO`. US symbols
 * are used as-is.
 */
export function yahooCandidates(symbol: string, market: "NSE" | "BSE" | "US"): string[] {
  if (market === "US") return [symbol];
  const override = YAHOO_TICKER_OVERRIDE[symbol];
  if (market === "BSE") return override ? [override] : [`${symbol}.BO`];
  return override ? [override] : [`${symbol}.NS`, `${symbol}.BO`];
}

/** Primary Yahoo ticker (first candidate) — kept for callers that want a single name. */
export function yahooSymbol(symbol: string, market: "NSE" | "BSE" | "US"): string {
  return yahooCandidates(symbol, market)[0];
}

export type PriceFetchResult = { symbol: string; date: string; close: number; via?: string } | null;

// A fallback ticker (anything but the first candidate) is only trusted if its latest candle is
// recent: a bare-ticker match on the other exchange could be a different, long-dormant company.
const FALLBACK_MAX_AGE_DAYS = 10;

async function fetchCloseForTicker(yq: string, symbol: string, market: "NSE" | "BSE" | "US"): Promise<PriceFetchResult> {
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
        return { symbol, date: sessionDate(timestamps[i], market), close: c, via: yq };
      }
    }
    return null;
  } catch {
    return null; // network error, timeout, abort — same "no price this time" outcome as any other miss
  }
}

/**
 * Fetches the latest available daily close for one symbol, trying each Yahoo candidate ticker in
 * order (see yahooCandidates). Best-effort: any non-2xx response, malformed body, or missing close
 * data returns null rather than throwing, so a caller looping over many symbols never has one bad
 * ticker abort the rest.
 */
export async function fetchLatestClose(symbol: string, market: "NSE" | "BSE" | "US"): Promise<PriceFetchResult> {
  const candidates = yahooCandidates(symbol, market);
  for (let k = 0; k < candidates.length; k++) {
    const r = await fetchCloseForTicker(candidates[k], symbol, market);
    if (!r) continue;
    if (k > 0) {
      const ageDays = (Date.now() - Date.parse(`${r.date}T00:00:00Z`)) / 86400000;
      if (ageDays > FALLBACK_MAX_AGE_DAYS) continue;
    }
    return r;
  }
  return null;
}

/** Fetches every symbol independently and in parallel; one failure never affects the others. */
export async function fetchLatestCloses(securities: { symbol: string; market: "NSE" | "BSE" | "US" }[]): Promise<Map<string, PriceFetchResult>> {
  const out = new Map<string, PriceFetchResult>();
  await Promise.all(
    securities.map(async (s) => {
      out.set(s.symbol, await fetchLatestClose(s.symbol, s.market));
    })
  );
  return out;
}
