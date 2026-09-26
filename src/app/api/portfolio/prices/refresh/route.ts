import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ingestPortfolio } from "@/lib/portfolio/ingest";
import { fetchLatestCloses } from "@/lib/portfolio/priceFeed";
import { fetchLatestCryptoCloses } from "@/lib/portfolio/cryptoPriceFeed";

/**
 * Refreshes daily-close prices — the single fetcher shared by the manual "Refresh prices" buttons
 * (India, US, Crypto pages) and the daily scheduled sync ("Kabir PMS: daily price sync", 8pm IST /
 * cron 30 14 * * *, which calls scope=all). See priceFeed.ts / cryptoPriceFeed.ts for the fetch
 * semantics.
 *
 * Dual auth, checked inside the handler (this route is excluded from the NextAuth middleware gate
 * in src/middleware.ts, same as /api/portfolio/ingest, precisely so the session-less scheduled-task
 * call isn't redirected before it gets here):
 *   - a signed-in NextAuth session (a button, called from an authenticated page), or
 *   - x-api-key: INGEST_API_KEY (the scheduled task, no browser session)
 *
 * Scope: `?scope=kabir|us|crypto|all` (default all):
 *   kabir  -> STOCK/ETF, currency INR, exchange NSE or BSE (Yahoo Finance)
 *   us     -> STOCK/ETF, currency USD (Yahoo Finance)
 *   crypto -> CRYPTO kind, e.g. BTC/ETH on CoinDCX (CoinGecko) — added 2026-09-26
 *   all    -> kabir + us + crypto, in one call
 * Indian mutual fund NAVs (CAMS-sourced, MUTUAL_FUND kind) are excluded — not exchange-quoted
 * instruments either feed covers; see /api/portfolio/mf/prices/refresh for those.
 *
 * Fallback contract (mandatory, per product decision): a symbol the relevant feed has no price for
 * this run simply isn't included in the ingest payload, so its existing PriceDaily row (last known
 * price) is left untouched. This is never an error — it's reported back as "fallback" in the response.
 */
const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const key = process.env.INGEST_API_KEY;
  const got = req.headers.get("x-api-key");
  if (key && got && safeEq(got, key)) return true;
  const session = await getServerSession(authOptions);
  return !!session?.user;
}

type Scope = "kabir" | "us" | "crypto" | "all";

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const scopeParam = req.nextUrl.searchParams.get("scope") ?? "all";
  if (!["kabir", "us", "crypto", "all"].includes(scopeParam)) {
    return NextResponse.json({ error: "invalid scope, expected kabir|us|crypto|all" }, { status: 400 });
  }
  const scope = scopeParam as Scope;

  const updated: { symbol: string; date: string; close: number }[] = [];
  const fallback: string[] = [];
  let requested = 0;

  if (scope !== "crypto") {
    const STOCK_ETF: ("STOCK" | "ETF")[] = ["STOCK", "ETF"];
    const where =
      scope === "kabir"
        ? { currency: "INR", exchange: { in: ["NSE", "BSE"] }, kind: { in: STOCK_ETF } }
        : scope === "us"
        ? { currency: "USD", kind: { in: STOCK_ETF } }
        : { kind: { in: STOCK_ETF }, OR: [{ currency: "INR", exchange: { in: ["NSE", "BSE"] } }, { currency: "USD" }] };

    const securities = await prisma.security.findMany({ where, select: { id: true, symbol: true, currency: true, exchange: true } });
    requested += securities.length;

    if (securities.length > 0) {
      const closes = await fetchLatestCloses(
        securities.map((s) => ({
          symbol: s.symbol,
          market: s.currency === "INR" ? (s.exchange === "BSE" ? ("BSE" as const) : ("NSE" as const)) : ("US" as const),
        }))
      );
      for (const s of securities) {
        const r = closes.get(s.symbol);
        if (r) updated.push(r);
        else fallback.push(s.symbol);
      }
    }
  }

  if (scope === "crypto" || scope === "all") {
    const cryptoSecurities = await prisma.security.findMany({ where: { kind: "CRYPTO" }, select: { symbol: true } });
    requested += cryptoSecurities.length;
    if (cryptoSecurities.length > 0) {
      const closes = await fetchLatestCryptoCloses(cryptoSecurities.map((s) => s.symbol));
      for (const s of cryptoSecurities) {
        const r = closes.get(s.symbol);
        if (r) updated.push(r);
        else fallback.push(s.symbol);
      }
    }
  }

  if (requested === 0) {
    return NextResponse.json({ scope, updated: [], fallback: [], error: null, count: { requested: 0, updated: 0, fallback: 0 } });
  }

  try {
    if (updated.length > 0) {
      await ingestPortfolio(prisma, {
        overwrite: true,
        prices: updated.map((u) => ({
          symbol: u.symbol,
          date: u.date,
          close: u.close,
          // CRYPTO symbols (BTC/ETH) never collide with a Yahoo-fed STOCK/ETF symbol — priceSource
          // is tagged per-symbol correctly rather than one fixed value for the whole batch.
          priceSource: u.symbol === "BTC" || u.symbol === "ETH" ? "coingecko" : "yahoo_finance",
        })),
      });
    }
    return NextResponse.json({
      scope,
      updated,
      fallback,
      count: { requested, updated: updated.length, fallback: fallback.length },
    });
  } catch (e) {
    console.error("price refresh ingest failed", e);
    return NextResponse.json({ error: "ingest failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
