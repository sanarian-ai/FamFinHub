import { NextRequest, NextResponse } from "next/server";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { pickPeriod, runPeriod } from "@/lib/portfolio/views";
import { bridgeFromRun } from "@/lib/portfolio/bridge";

export const dynamic = "force-dynamic";

/** On-demand data for the India MF performance page's "Why trust this number?" panel — single
 * holder, no filters beyond price-only, mirroring ../performance/page.tsx. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { ctx, channelAccounts } = await getIndiaPortfolioData();
  const accounts = channelAccounts.MF;
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) return NextResponse.json({ error: "no-data" }, { status: 404 });

  const po = sp.get("po");
  const period = pickPeriod(ctx, sp.get("p") ?? undefined, accounts);
  const r = runPeriod(ctx, period, { accounts, dividends: po !== "1" });
  if (!r.hasData) return NextResponse.json({ error: "no-data" }, { status: 404 });

  return NextResponse.json(bridgeFromRun(r));
}
