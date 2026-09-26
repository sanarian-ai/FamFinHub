import { NextRequest, NextResponse } from "next/server";
import { getPortfolioData } from "@/lib/portfolio/data";
import { accountsFor, pickPeriod, runPeriod, type BrokerKey } from "@/lib/portfolio/views";
import { bridgeFromRun } from "@/lib/portfolio/bridge";

export const dynamic = "force-dynamic";

/** On-demand data for the US performance page's "Why trust this number?" panel — mirrors the exact
 * scope (broker, currency, price-only) the page itself resolves in ../performance/page.tsx, so the
 * bridge always reconciles to what's on screen. Not part of the page's own render — fetched only
 * when the panel is expanded, since most visits never open it. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { ctx, empty } = await getPortfolioData();
  if (empty) return NextResponse.json({ error: "no-data" }, { status: 404 });

  const brRaw = sp.get("br");
  const br: BrokerKey = brRaw === "INDmoney" || brRaw === "IBKR" ? brRaw : "ALL";
  const accounts = accountsFor(br);
  const cur = sp.get("cur") === "INR" ? "INR" : "USD";
  const po = sp.get("po");
  const period = pickPeriod(ctx, sp.get("p") ?? undefined, accounts);
  const r = runPeriod(ctx, period, { accounts, currency: cur, dividends: po !== "1" });
  if (!r.hasData) return NextResponse.json({ error: "no-data" }, { status: 404 });

  return NextResponse.json(bridgeFromRun(r));
}
