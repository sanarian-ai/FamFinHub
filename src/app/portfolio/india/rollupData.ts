import { stockRows } from "@/lib/portfolio/views";
import { inceptionStart, type Ctx } from "@/lib/portfolio/engine";
import type { OpenClosed } from "./rollupConstants";

/** Resolves the Open/Closed/All filter to a `symbols` restriction for engine.run(). "Open" =
 * currently-held symbols (their full historic cashflows still count toward IRR); "Closed" =
 * symbols with zero units today (fully exited) — this is where a channel's own historic/realised
 * return lives once it's fully wound down, per the rollup design (Unifi, KCV, KFV once ingested).
 * "All" = no restriction (undefined, engine's default: every symbol traded in scope). */
export function symbolsForFilter(ctx: Ctx, accounts: string[], oc: OpenClosed): string[] | undefined {
  if (oc === "ALL") return undefined;
  if (!ctx.trades.some((t) => accounts.includes(t.account))) return [];
  const rows = stockRows(ctx, { start: inceptionStart(ctx, accounts), end: ctx.asof }, { accounts });
  return rows.filter((r) => (oc === "OPEN" ? r.status === "open" : r.status === "exited")).map((r) => r.symbol);
}
