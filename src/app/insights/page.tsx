import Link from "next/link";
import clsx from "clsx";
import { PageHeader, Card, StatTile, Badge, EmptyState } from "@/components/ui";
import { formatINR } from "@/lib/format";
import {
  getMonthlyByType,
  getMonthlyByAccount,
  getExpenditureNatures,
  getExpenditureTypes,
  computeYoY,
  computeTrend,
  computeSeasonality,
  computeAccountTotals,
  computeAccountYearly,
  computeAnomalies,
  defaultTrendSelector,
  parseTrendParam,
  monthLabel,
  getAvailableYears,
  parseYearsParam,
  filterRowsByYears,
  type ViewMode,
  type TrendSelector,
} from "./queries";
import { YoYBarChart } from "./YoYBarChart";
import { TrendAreaChart } from "./TrendAreaChart";
import { SeasonalityBarChart } from "./SeasonalityBarChart";
import { AccountStackedBarChart } from "./AccountStackedBarChart";
import { FilterSelect } from "./FilterSelect";
import { YearMultiSelect } from "./YearMultiSelect";
import { CATEGORICAL, OTHER_SLOT } from "./chartTheme";

export const dynamic = "force-dynamic"; // always compute live off current DB state — never cache stale trends

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function InsightsPage({ searchParams }: { searchParams: SearchParams }) {
  const view: ViewMode = searchParams.view === "fy" ? "fy" : "cal";
  const rawNature = typeof searchParams.nature === "string" ? searchParams.nature : "all";
  const rawTrend = typeof searchParams.trend === "string" ? searchParams.trend : undefined;
  const rawYears = typeof searchParams.years === "string" ? searchParams.years : undefined;

  const [monthlyTypeAll, monthlyAccountAll, natures, types] = await Promise.all([
    getMonthlyByType(),
    getMonthlyByAccount(),
    getExpenditureNatures(),
    getExpenditureTypes(),
  ]);

  // --- Global year filter (the "uber" selector) — scopes every view on this page ---
  const availableYears = getAvailableYears(monthlyTypeAll, view);
  const selectedYears = parseYearsParam(rawYears);
  const monthlyType = filterRowsByYears(monthlyTypeAll, view, selectedYears);
  const monthlyAccount = filterRowsByYears(monthlyAccountAll, view, selectedYears);
  const yearsFilterActive = selectedYears != null;

  // --- YoY ---
  const yoyNature = natures.some((n) => n.id === rawNature) ? rawNature : "all";
  const yoy = computeYoY(monthlyType, view, yoyNature);
  const latestYear = yoy[yoy.length - 1];
  const totalAllTime = monthlyType.reduce((s, r) => s + r.spend, 0);
  const monthsCovered = new Set(monthlyType.map((r) => r.ym)).size;
  const yearsCovered = new Set(monthlyType.map((r) => r.ym.slice(0, 4))).size;
  const avgMonthly = monthsCovered ? totalAllTime / monthsCovered : 0;

  function qs(overrides: Record<string, string>) {
    const merged: Record<string, string> = {
      view,
      nature: yoyNature,
      trend: `${trendSel.kind}:${trendSel.id}`,
      ...(rawYears ? { years: rawYears } : {}),
      ...overrides,
    };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/insights?${params.toString()}`;
  }

  // --- Category trend explorer ---
  const trendSel: TrendSelector = parseTrendParam(rawTrend, types) ?? defaultTrendSelector(monthlyType);
  const trendData = computeTrend(monthlyType, view, trendSel);
  const trendLabel =
    trendSel.kind === "type"
      ? types.find((t) => t.id === trendSel.id)?.name
      : natures.find((n) => n.id === trendSel.id)?.name;
  const trendGroups = [
    {
      label: "Whole nature (all types combined)",
      options: natures.map((n) => ({ value: `nature:${n.id}`, label: n.name })),
    },
    ...natures.map((n) => ({
      label: `${n.name} → types`,
      options: types.filter((t) => t.natureId === n.id).map((t) => ({ value: `type:${t.id}`, label: t.name })),
    })),
  ];

  // --- Seasonality ---
  const seasonality = computeSeasonality(monthlyType);
  const peakMonth = [...seasonality].sort((a, b) => b.avg - a.avg)[0];

  // --- Account-level ---
  const accountTotals = computeAccountTotals(monthlyAccount);
  const topAccounts = accountTotals.slice(0, 5);
  const topIds = topAccounts.map((a) => a.accountId);
  const accountYearly = computeAccountYearly(monthlyAccount, view, topIds);
  const accountSeries = [
    ...topAccounts.map((a, i) => ({ key: a.accountId, name: `${a.accountName} (${a.holder})`, color: CATEGORICAL[i] })),
    ...(accountTotals.length > 5 ? [{ key: "__other__", name: "Other accounts", color: OTHER_SLOT }] : []),
  ];
  const grandTotalSpend = accountTotals.reduce((s, a) => s + a.total, 0);

  // --- Anomalies ---
  const anomalies = computeAnomalies(monthlyType).slice(0, 12);

  return (
    <div className="max-w-6xl">
      <PageHeader
        title="Insights & Trends"
        subtitle="13 years of real spend, aggregated live from the ledger — replaces the old per-year Sheet tabs that quietly broke."
        actions={
          <div className="flex items-center gap-2">
            <YearMultiSelect options={availableYears} />
            <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
              <Link
                href={qs({ view: "cal" })}
                className={clsx(
                  "rounded-md px-3 py-1 font-medium",
                  view === "cal" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                Calendar Year
              </Link>
              <Link
                href={qs({ view: "fy" })}
                className={clsx(
                  "rounded-md px-3 py-1 font-medium",
                  view === "fy" ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
                )}
              >
                Fiscal Year
              </Link>
            </div>
            <a
              href={`/insights/export?view=${view}&nature=${yoyNature}${rawYears ? `&years=${rawYears}` : ""}`}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Export YoY CSV
            </a>
          </div>
        }
      />

      {yearsFilterActive && (
        <p className="-mt-4 mb-6 text-xs text-slate-500">
          Showing only the years selected above — every view on this page (YoY, trend explorer, seasonality, account
          breakdown, anomalies, export) is scoped to that selection.{" "}
          <Link href={qs({ years: "" })} className="font-medium text-slate-700 underline underline-offset-2">
            Clear filter
          </Link>
        </p>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatTile label={yearsFilterActive ? "Total spend (selected years)" : "Total spend (all-time)"} value={formatINR(totalAllTime)} />
        <StatTile label="Avg monthly spend" value={formatINR(avgMonthly)} />
        <StatTile
          label={`${latestYear?.label ?? "Latest year"}${latestYear?.partial ? " (partial)" : ""}`}
          value={formatINR(latestYear?.total ?? 0)}
          delta={latestYear?.pctChange ?? null}
          deltaLabel="vs prior year"
        />
        <StatTile label={yearsFilterActive ? "Years selected" : "Years of history"} value={`${yearsCovered} yrs`} />
      </div>

      {/* YoY comparison */}
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Year-over-year spend</h2>
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={qs({ nature: "all" })}
              className={clsx(
                "rounded-full px-2.5 py-1 text-xs font-medium",
                yoyNature === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
              )}
            >
              All categories
            </Link>
            {natures.map((n) => (
              <Link
                key={n.id}
                href={qs({ nature: n.id })}
                className={clsx(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  yoyNature === n.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                )}
              >
                {n.name}
              </Link>
            ))}
          </div>
        </div>
        {yoy.length === 0 ? (
          <EmptyState>No spend recorded for this filter.</EmptyState>
        ) : (
          <>
            <YoYBarChart data={yoy} />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="py-1.5 pr-4">{view === "fy" ? "Fiscal Year" : "Year"}</th>
                    <th className="py-1.5 pr-4">Total Spend</th>
                    <th className="py-1.5 pr-4">YoY Δ</th>
                  </tr>
                </thead>
                <tbody>
                  {yoy.map((y) => (
                    <tr key={y.label} className="border-b border-slate-100 last:border-0">
                      <td className="py-1.5 pr-4 font-medium text-slate-800">
                        {y.label}
                        {y.partial && (
                          <span className="ml-1.5">
                            <Badge tone="amber">partial</Badge>
                          </span>
                        )}
                      </td>
                      <td className="py-1.5 pr-4 text-slate-700">{formatINR(y.total)}</td>
                      <td className="py-1.5 pr-4">
                        {y.pctChange == null ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <span className={y.pctChange > 0 ? "text-rose-600" : "text-emerald-600"}>
                            {y.pctChange > 0 ? "▲" : "▼"} {Math.abs(y.pctChange).toFixed(1)}%
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Category trend explorer */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Category trend explorer</h2>
            <FilterSelect
              paramName="trend"
              value={`${trendSel.kind}:${trendSel.id}`}
              groups={trendGroups}
              ariaLabel="Choose category or nature to trend"
            />
          </div>
          <p className="mb-2 text-xs text-slate-500">
            {trendLabel ?? "—"} · {view === "fy" ? "by fiscal year" : "by calendar year"}
          </p>
          {trendData.length === 0 ? <EmptyState>No spend recorded for this selection.</EmptyState> : <TrendAreaChart data={trendData} />}
        </Card>

        {/* Seasonality */}
        <Card>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Seasonality — avg spend by month</h2>
            {peakMonth && (
              <span className="text-xs text-slate-500">
                Peak: <span className="font-medium text-slate-700">{peakMonth.monthName}</span>
              </span>
            )}
          </div>
          <p className="mb-2 text-xs text-slate-500">
            Averaged across {yearsFilterActive ? "the selected years" : "all years in history"}, all Expenditure categories.
          </p>
          <SeasonalityBarChart data={seasonality} />
        </Card>
      </div>

      {/* Account-level */}
      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Spend by account</h2>
        {accountYearly.length === 0 ? (
          <EmptyState>No account-linked spend recorded.</EmptyState>
        ) : (
          <AccountStackedBarChart data={accountYearly} series={accountSeries} />
        )}
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="py-1.5 pr-4">Account</th>
                <th className="py-1.5 pr-4">Holder</th>
                <th className="py-1.5 pr-4">Total spend (all-time)</th>
                <th className="py-1.5 pr-4">Share</th>
              </tr>
            </thead>
            <tbody>
              {accountTotals.map((a) => (
                <tr key={a.accountId} className="border-b border-slate-100 last:border-0">
                  <td className="py-1.5 pr-4 font-medium text-slate-800">{a.accountName}</td>
                  <td className="py-1.5 pr-4 text-slate-600">
                    <Badge tone={a.holder === "Ria" ? "blue" : "slate"}>{a.holder}</Badge>
                  </td>
                  <td className="py-1.5 pr-4 text-slate-700">{formatINR(a.total)}</td>
                  <td className="py-1.5 pr-4 text-slate-500">
                    {grandTotalSpend ? ((a.total / grandTotalSpend) * 100).toFixed(1) : "0.0"}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {accountTotals.some((a) => a.accountId === "__unattributed__") && (
          <p className="mt-3 text-xs text-slate-500">
            &ldquo;Unattributed&rdquo; rows are historical transactions migrated without a linked account — an honest gap
            carried over from the source data, not hidden.
          </p>
        )}
      </Card>

      {/* Anomalies */}
      <Card>
        <h2 className="mb-1 text-sm font-semibold text-slate-900">Anomaly callouts</h2>
        <p className="mb-3 text-xs text-slate-500">
          Months where an expense type ran more than 2 standard deviations above its own historical monthly average
          (types need at least 6 active months of history to qualify).
        </p>
        {anomalies.length === 0 ? (
          <EmptyState>No statistically unusual months found.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-100">
            {anomalies.map((a, i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-2 text-sm">
                <div>
                  <span className="font-medium text-slate-800">{a.typeName}</span>{" "}
                  <span className="text-slate-500">({a.natureName})</span> was{" "}
                  <span className="font-semibold text-rose-600">{a.ratio.toFixed(1)}×</span> its typical month in{" "}
                  <span className="font-medium text-slate-800">{monthLabel(a.ym)}</span>
                </div>
                <div className="whitespace-nowrap text-xs text-slate-500">
                  {formatINR(a.spend)} <span className="text-slate-400">vs avg {formatINR(a.mean)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
