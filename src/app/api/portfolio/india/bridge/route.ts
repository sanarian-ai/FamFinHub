import { NextRequest, NextResponse } from "next/server";
import { getIndiaPortfolioData, type HolderKey } from "@/lib/portfolio/india-data";
import { pickPeriod, runPeriod } from "@/lib/portfolio/views";
import { bridgeFromRun } from "@/lib/portfolio/bridge";
import { symbolsForFilter } from "@/app/portfolio/india/rollupData";
import type { OpenClosed } from "@/app/portfolio/india/rollupConstants";

export const dynamic = "force-dynamic";

/** On-demand data for the India rollup performance page's "Why trust this number?" panel — mirrors
 * ../performance/page.tsx's own scope resolution (holder, open/closed, price-only). */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { ctx, holderAccounts } = await getIndiaPortfolioData();

  const hRaw = sp.get("h");
  const h: HolderKey = hRaw === "SANGEETH" || hRaw === "RIA" ? hRaw : "HOUSEHOLD";
  const accounts = holderAccounts[h];
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) return NextResponse.json({ error: "no-data" }, { status: 404 });

  const ocRaw = sp.get("oc");
  const oc: OpenClosed = ocRaw === "OPEN" || ocRaw === "CLOSED" ? ocRaw : "ALL";
  const symbols = symbolsForFilter(ctx, accounts, oc);
  const po = sp.get("po");
  const period = pickPeriod(ctx, sp.get("p") ?? undefined, accounts);
  const r = runPeriod(ctx, period, { accounts, symbols, dividends: po !== "1" });
  if (!r.hasData) return NextResponse.json({ error: "no-data" }, { status: 404 });

  return NextResponse.json(bridgeFromRun(r));
}
