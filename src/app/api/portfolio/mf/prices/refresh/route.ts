import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ingestPortfolio } from "@/lib/portfolio/ingest";
import { fetchAmfiNavs } from "@/lib/portfolio/amfiNav";

/**
 * Refreshes mutual fund NAVs from AMFI's free NAVAll.txt — the MF counterpart to
 * /api/portfolio/prices/refresh (which explicitly excludes mutual funds; see priceFeed.ts). Same
 * dual-auth pattern (session or x-api-key), same "leave last known price untouched on a miss"
 * fallback contract as the stock refresh route.
 *
 * Scope: every MUTUAL_FUND security whose symbol is a 12-character ISIN (every CAMS-sourced one
 * is — see camsParser.ts). A MUTUAL_FUND security keyed by a short mnemonic symbol instead (the
 * 4 pre-existing Kabir PMS liquid/arbitrage funds, seeded before ISIN-keying was adopted here)
 * simply won't match anything in the ISIN-keyed AMFI file and is reported back as a fallback,
 * same as a symbol AMFI has no NAV for.
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

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const securities = await prisma.security.findMany({
    where: { kind: "MUTUAL_FUND" },
    select: { id: true, symbol: true },
  });

  if (securities.length === 0) {
    return NextResponse.json({ updated: [], fallback: [], error: null, count: { requested: 0, updated: 0, fallback: 0 } });
  }

  const navs = await fetchAmfiNavs();

  const updated: { symbol: string; date: string; close: number }[] = [];
  const fallback: string[] = [];
  for (const s of securities) {
    const hit = navs.get(s.symbol);
    if (hit) updated.push({ symbol: s.symbol, date: hit.date, close: hit.nav });
    else fallback.push(s.symbol);
  }

  try {
    if (updated.length > 0) {
      await ingestPortfolio(prisma, {
        overwrite: true,
        prices: updated.map((u) => ({ symbol: u.symbol, date: u.date, close: u.close, priceSource: "amfi_nav" })),
      });
    }
    return NextResponse.json({
      updated,
      fallback,
      count: { requested: securities.length, updated: updated.length, fallback: fallback.length },
    });
  } catch (e) {
    console.error("mf price refresh ingest failed", e);
    return NextResponse.json({ error: "ingest failed", detail: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
