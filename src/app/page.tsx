import Link from "next/link";
import { Badge, Card, PageHeader, StatTile } from "@/components/ui";
import { formatDate, formatINR, pctChange } from "@/lib/format";
import {
  getEffectiveNow,
  getExpenditureRows,
  getExpenditureTotal,
  getNeedsReviewCount,
} from "./dashboard-parts/queries";
import {
  getPeriod,
  monthRange,
  monthShortLabel,
  previousPeriod,
  samePeriodLastYear,
  trailingMonths,
  type PeriodKind,
  type YearView,
} from "./dashboard-parts/period";
import { bucketByMonthAndNature, sumByAccount, sumByNature, topMovers } from "./dashboard-parts/aggregate";
import { NATURE_COLOR_ORDER } from "./dashboard-parts/colors";
import { PeriodSelector } from "./dashboard-parts/PeriodSelector";
import { TrendChart, type TrendDatum } from "./dashboard-parts/TrendChart";
import { NatureDonut } from "./dashboard-parts/NatureDonut";
import { AccountSplit } from "./dashboard-parts/AccountSplit";
import { TopMovers } from "./dashboard-parts/TopMovers";

export const dynamic = "force-dynamic"; // always reflect the live dev database

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const periodParam = typeof params.period === "string" ? params.period : "month";
  const viewParam = typeof params.view === "string" ? params.view : "cal";
  const kind: PeriodKind = periodParam === "year" ? "year" : "month";
  const view: YearView = viewParam === "fy" ? "fy" : "cal";

  const effectiveNow = await getEffectiveNow();

  const current = getPeriod(kind, view, effectiveNow);
  const prevPeriod = previousPeriod(kind, view, current);
  const sameLastYear = samePeriodLastYear(kind, view, current);

  // Top movers and the trend chart are always "trailing months" concepts,
  // independent of the period-length toggle above.
  const currentMonth = monthRange(effectiveNow);
  const prevMonth = previousPeriod("month", "cal", currentMonth);
  const months = trailingMonths(effectiveNow, 12);
  const trailingStart = months[0].start;
  const trailingEnd = months[months.length - 1].end;

  const [currentRows, prevTotal, sameLastYearTotal, needsReviewCount, trailingRows, moverCurrentRows, moverPrevRows] =
    await Promise.all([
      getExpenditureRows(current.start, current.end),
      getExpenditureTotal(prevPeriod.start, prevPeriod.end),
      getExpenditureTotal(sameLastYear.start, sameLastYear.end),
      getNeedsReviewCount(),
      getExpenditureRows(trailingStart, trailingEnd),
      getExpenditureRows(currentMonth.start, currentMonth.end),
      getExpenditureRows(prevMonth.start, prevMonth.end),
    ]);

  const currentTotal = currentRows.reduce((s, r) => s + r.amount, 0);
  const natureTotals = sumByNature(currentRows);
  const accountTotals = sumByAccount(currentRows);
  const movers = topMovers(moverCurrentRows, moverPrevRows, 5);

  const buckets = bucketByMonthAndNature(trailingRows, months);
  const trendData: TrendDatum[] = buckets.map((b) => {
    const row: TrendDatum = { month: monthShortLabel(b.month.start) };
    for (const n of NATURE_COLOR_ORDER) row[n] = b.byNature.get(n) ?? 0;
    return row;
  });

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`As of ${formatDate(effectiveNow)} — ${current.label}`}
        actions={<PeriodSelector kind={kind} view={view} />}
      />

      {needsReviewCount > 0 && (
        <Link href="/review" className="mb-6 block">
          <Card className="flex items-center justify-between gap-4 border-amber-200 bg-amber-50 hover:bg-amber-100">
            <div className="flex items-center gap-3">
              <span className="text-xl" aria-hidden>
                ⚠️
              </span>
              <div>
                <div className="text-sm font-semibold text-amber-900">
                  {needsReviewCount} transaction{needsReviewCount === 1 ? "" : "s"} need
                  {needsReviewCount === 1 ? "s" : ""} categorization
                </div>
                <div className="text-xs text-amber-700">Head to the Review Queue to clear them out.</div>
              </div>
            </div>
            <Badge tone="amber">Review now →</Badge>
          </Card>
        </Link>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label={`Spend — ${current.label}`} value={formatINR(currentTotal)} />
        <StatTile
          label="vs last period"
          value={formatINR(prevTotal)}
          delta={pctChange(currentTotal, prevTotal)}
          deltaLabel={`vs ${prevPeriod.label}`}
        />
        <StatTile
          label="vs same period last year"
          value={formatINR(sameLastYearTotal)}
          delta={pctChange(currentTotal, sameLastYearTotal)}
          deltaLabel={`vs ${sameLastYear.label}`}
        />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Trailing 12 months — expenditure by nature</h2>
          <TrendChart data={trendData} />
        </Card>
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Spend by nature — {current.label}</h2>
          <p className="mb-4 text-xs text-slate-400">Click a category to view it in the Ledger.</p>
          <NatureDonut data={natureTotals} total={currentTotal} />
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Top movers</h2>
          <p className="mb-2 text-xs text-slate-400">
            Categories with the largest change, {monthShortLabel(prevMonth.start)} → {monthShortLabel(currentMonth.start)}
          </p>
          <TopMovers movers={movers} />
        </Card>
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Spend by account — {current.label}</h2>
          <p className="mb-4 text-xs text-slate-400">Sangeeth &amp; Ria's active accounts.</p>
          <AccountSplit accounts={accountTotals} />
        </Card>
      </div>
    </div>
  );
}
