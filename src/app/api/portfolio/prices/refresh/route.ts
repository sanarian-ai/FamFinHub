import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ingestPortfolio } from "@/lib/portfolio/ingest";
import { fetchLatestCloses } from "@/lib/portfolio/priceFeed";

/**
 * Refreshes daily-close prices from Yahoo Finance's free, unofficial endpoint — the single fetcher
 * shared by the manual "Refresh prices" button (India page) and the daily scheduled sync ("Kabir PMS:
 * daily price sync", 8pm IST / cron 30 14 * * *). See priceFeed.ts for the fetch semantics.
 *
 * Dual auth, checked inside the handler (this route is excluded from the NextAuth middleware gate
 * in src/middleware.ts, same as /api/portfolio/ingest, precisely so the session-less scheduled-task
 * call isn't redirected before it gets here):
 *   - a signed-in NextAuth session (the button, called from an authenticated page), or
 *   - x-api-key: INGEST_API_KEY (the scheduled task, no browser session)
 *
 * Scope: STOCK/ETF securities only, selected by `?scope=kabir|us|all` (default all):
 *   kabir -> currency INR, exchange NSE or BSE   us -> currency USD
 * BSE-listed symbols (scrip code as the security's symbol, e.g. "544937") map to Yahoo's `.BO`
 * suffix instead of NSE's `.NS` — see priceFeed.ts yahooSymbol. A brand-new listing Yahoo hasn't
 * indexed yet just falls back like any other miss (see the contract below).
 * Indian mutual fund NAVs (the 4 Kabir liquid/arbitrage funds) are excluded — not exchange-quoted
 * instruments this feed covers.
 *
 * Fallback contract (mandatory, per product decision): a symbol Yahoo has no price for this run
 * simply isn't included in the ingest payload, so its existing PriceDaily row (last known price)
 * is left untouched. This is never an error — it's reported back as "fallback" in the response.
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

type Scope = "kabir" | "us" | "all";

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const scopeParam = req.nextUrl.searchParams.get("scope") ?? "all";
  if (!["kabir", "us", "all"].includes(scopeParam)) {
    return NextResponse.json({ error: "invalid scope, expected kabir|us|all" }, { status: 400 });
  }
  const scope = scopeParam as Scope;

  const STOCK_ETF: ("STOCK" | "ETF")[] = ["STOCK", "ETF"];
  const where =
    scope === "kabir"
      ? { currency: "INR", exchange: { in: ["NSE", "BSE"] }, kind: { in: STOCK_ETF } }
      : scope === "us"
      ? { currency: "USD", kind: { in: STOCK_ETF } }
      : { kind: { in: STOCK_ETF }, OR: [{ currency: "INR", exchange: { in: ["NSE", "BSE"] } }, { currency: "USD" }] };

  const securities = await prisma.security.findMany({
    where,
    select: { id: true, symbol: true, currency: true, exchange: true },
  });

  if (securities.length === 0) {
    return NextResponse.json({ scope, updated: [], fallback: [], error: null, count: { requested: 0, updated: 0, fallback: 0 } });
  }

  const closes = await fetchLatestCloses(
    securities.map((s) => ({
      symbol: s.symbol,
      market: s.currency === "INR" ? (s.exchange === "BSE" ? ("BSE" as const) : ("NSE" as const)) : ("US" as const),
    }))
  );

  const updated: { symbol: string; date: string; close: number }[] = [];
  const fallback: string[] = [];
  for (const s of securities) {
    const r = closes.get(s.symbol);
    if (r) updated.push(r);
    else fallback.push(s.symbol);
  }

  try {
    if (updated.length > 0) {
      await ingestPortfolio(prisma, {
        overwrite: true,
        prices: updated.map((u) => ({ symbol: u.symbol, date: u.date, close: u.close, priceSource: "yahoo_finance" })),
      });
    }
    return NextResponse.json({
      scope,
      updated,
      fallback,
      count: { requested: securities.length, updated: updated.length, fallback: fallback.length },
    });
  } catch (e) {
    console.error("price refresh ingest failed", e);
    return NextResponse.json({ error: "ingest failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
