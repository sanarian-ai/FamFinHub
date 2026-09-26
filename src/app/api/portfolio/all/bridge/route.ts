import { NextRequest, NextResponse } from "next/server";
import { getPortfolioData } from "@/lib/portfolio/data";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { getCryptoPortfolioData } from "@/lib/portfolio/crypto-data";
import { inceptionStart } from "@/lib/portfolio/engine";
import { combinedRun } from "@/lib/portfolio/combined";
import { periodDefs } from "@/lib/portfolio/views";
import { bridgeFromCombined } from "@/lib/portfolio/bridge";

export const dynamic = "force-dynamic";

/** On-demand data for the All Assets performance page's "Why trust this number?" panel — mirrors
 * ../performance/page.tsx's own period/spine resolution and combinedRun() call exactly. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const [usData, indiaData, cryptoData] = await Promise.all([getPortfolioData(), getIndiaPortfolioData(), getCryptoPortfolioData()]);
  const { ctx: usCtx, empty: usEmpty } = usData;
  const { ctx: indiaCtx, channelAccounts, empty: indiaEmpty } = indiaData;
  const indiaAll = channelAccounts.ALL;
  const indiaHasTrades = indiaCtx.trades.some((t) => indiaAll.includes(t.account));
  if (usEmpty || indiaEmpty || !indiaHasTrades) return NextResponse.json({ error: "no-data" }, { status: 404 });
  const cryptoCtx = cryptoData.empty ? undefined : cryptoData.ctx;

  const usInception = inceptionStart(usCtx);
  const indiaInception = inceptionStart(indiaCtx, indiaAll);
  const spineIsIndia = indiaInception <= usInception;
  const defs = periodDefs(spineIsIndia ? indiaCtx : usCtx, spineIsIndia ? indiaAll : undefined);
  const pKey = sp.get("p") ?? undefined;
  const period = defs.find((d) => d.key === pKey) ?? defs.find((d) => d.key === "SI")!;

  const po = sp.get("po");
  const main = combinedRun(usCtx, indiaCtx, indiaAll, period.start, period.end, { cryptoCtx, dividends: po !== "1" });
  if (!main.hasData) return NextResponse.json({ error: "no-data" }, { status: 404 });

  return NextResponse.json(bridgeFromCombined(main));
}
