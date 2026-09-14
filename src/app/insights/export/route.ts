import { NextRequest, NextResponse } from "next/server";
import {
  computeYoY,
  getExpenditureNatures,
  getMonthlyByType,
  filterRowsByYears,
  parseYearsParam,
  toCsv,
  type ViewMode,
} from "../queries";

/**
 * CSV export for the Insights screen. Kept simple per spec: exports the YoY summary table
 * (year, total spend, %Δ) for whatever view/nature/years filter the page currently has
 * selected — not every chart's underlying rows, to keep this one Route Handler easy to reason
 * about. `?view=cal|fy&nature=<id|all>&years=<comma-separated sortKeys>` mirror the page's own
 * query params, so "Export YoY CSV" always exports exactly what's on screen.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const view = (searchParams.get("view") === "fy" ? "fy" : "cal") as ViewMode;
  const natureParam = searchParams.get("nature") ?? "all";
  const selectedYears = parseYearsParam(searchParams.get("years") ?? undefined);

  const [allRows, natures] = await Promise.all([getMonthlyByType(), getExpenditureNatures()]);
  const rows = filterRowsByYears(allRows, view, selectedYears);
  const natureName =
    natureParam === "all" ? "All categories" : natures.find((n) => n.id === natureParam)?.name ?? "All categories";
  const effectiveFilter = natures.some((n) => n.id === natureParam) ? natureParam : "all";

  const yoy = computeYoY(rows, view, effectiveFilter);

  const csv = toCsv(
    [view === "fy" ? "Fiscal Year" : "Calendar Year", "Total Spend (INR)", "YoY % Change", "Partial Year"],
    yoy.map((y) => [y.label, y.total.toFixed(2), y.pctChange == null ? "" : y.pctChange.toFixed(1), y.partial ? "yes" : ""]),
  );

  const fileNature = natureName.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="insights-yoy-${view}-${fileNature}.csv"`,
    },
  });
}
