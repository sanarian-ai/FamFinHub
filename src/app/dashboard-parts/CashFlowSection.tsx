"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { Card } from "@/components/ui";
import { CashFlowTrendChart, type CashFlowDatum } from "./CashFlowTrendChart";
import { BreakdownCard } from "./BreakdownCard";
import { FLOW_COLORS } from "./colors";
import { sumByNature, sumByCategoryRanked, sumByAccountType, filterRowsInRange, type RankedCategoryTotals } from "./aggregate";
import { getYearBreakdownAction, type YearBreakdown } from "./actions";
import type { ExpenditureRow, IncomeRow, AccountTypeRow } from "./queries";
import type { PeriodRange, Holder } from "./period";

type Granularity = "month" | "year";

const EMPTY_CATEGORY_DATA: RankedCategoryTotals = { items: [], otherTotal: 0, otherCount: 0 };

/**
 * Owns the "which trailing month (or which calendar year) is drilled into" state and everything
 * downstream of it: the clickable trend chart, the Month/Year toggle, and the Expense/Income
 * composition cards below it. Lives as one client component (rather than page.tsx wiring
 * several independent client pieces together) because the trend chart and the two composition
 * cards all need to share that selection instantly.
 *
 * Month mode re-slices a single trailing-12-month row set fetched once, server-side, in
 * page.tsx — every click/selection just re-filters/re-aggregates that same in-memory data, no
 * round trip. Year mode is different: the app holds ~14 years of transaction history, well
 * outside that trailing window, so picking a year fetches + aggregates on demand via a Server
 * Action (see actions.ts) and caches the result per year for the rest of the session.
 */
export function CashFlowSection({
  months,
  availableYears,
  cashFlowTrendData,
  trailingExpenditureRows,
  trailingIncomeRows,
  trailingAccountTypeRows,
  holder,
}: {
  months: PeriodRange[];
  /** Every calendar year with transaction history, descending (most recent first). */
  availableYears: number[];
  cashFlowTrendData: CashFlowDatum[];
  trailingExpenditureRows: ExpenditureRow[];
  trailingIncomeRows: IncomeRow[];
  trailingAccountTypeRows: AccountTypeRow[];
  holder?: Holder;
}) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [selectedIndex, setSelectedIndex] = useState(months.length - 1); // latest month, by default
  const [selectedYear, setSelectedYear] = useState(availableYears[0]);
  const [yearData, setYearData] = useState<YearBreakdown | null>(null);
  const [isPending, startTransition] = useTransition();
  const yearCache = useRef(new Map<number, YearBreakdown>());

  const selected = months[selectedIndex];
  const isLatestMonth = selectedIndex === months.length - 1;

  // --- Month mode: instant client-side slice of the trailing-12-month fetch already in memory.
  const monthExpenditureRows = useMemo(() => filterRowsInRange(trailingExpenditureRows, selected), [trailingExpenditureRows, selected]);
  const monthIncomeRows = useMemo(() => filterRowsInRange(trailingIncomeRows, selected), [trailingIncomeRows, selected]);
  const monthAccountTypeRows = useMemo(() => filterRowsInRange(trailingAccountTypeRows, selected), [trailingAccountTypeRows, selected]);

  const monthExpenseNatureData = useMemo(() => sumByNature(monthExpenditureRows), [monthExpenditureRows]);
  const monthExpenseTotal = useMemo(() => monthExpenditureRows.reduce((s, r) => s + r.amount, 0), [monthExpenditureRows]);
  const monthExpenseCategoryData = useMemo(() => sumByCategoryRanked(monthExpenditureRows), [monthExpenditureRows]);

  const monthIncomeNatureData = useMemo(() => sumByNature(monthIncomeRows), [monthIncomeRows]);
  const monthIncomeTotal = useMemo(() => monthIncomeRows.reduce((s, r) => s + r.amount, 0), [monthIncomeRows]);
  const monthIncomeCategoryData = useMemo(() => sumByCategoryRanked(monthIncomeRows), [monthIncomeRows]);

  const monthAccountTypeData = useMemo(() => sumByAccountType(monthAccountTypeRows), [monthAccountTypeRows]);
  const monthAccountTypeTotal = useMemo(() => monthAccountTypeData.reduce((s, d) => s + d.total, 0), [monthAccountTypeData]);

  // --- Year mode: fetch on demand (once per year, then cached) via the Server Action.
  useEffect(() => {
    if (granularity !== "year") return;
    const cached = yearCache.current.get(selectedYear);
    if (cached) {
      setYearData(cached);
      return;
    }
    startTransition(async () => {
      const data = await getYearBreakdownAction(selectedYear, holder);
      yearCache.current.set(selectedYear, data);
      setYearData(data);
    });
  }, [granularity, selectedYear, holder]);

  const yearLoading = granularity === "year" && (isPending || !yearData || yearData.year !== selectedYear);

  // --- Whichever mode is active, converge on one set of values the cards below render.
  const expenseNatureData = granularity === "year" ? yearData?.expenseNatureData ?? [] : monthExpenseNatureData;
  const expenseTotal = granularity === "year" ? yearData?.expenseTotal ?? 0 : monthExpenseTotal;
  const expenseCategoryData = granularity === "year" ? yearData?.expenseCategoryData ?? EMPTY_CATEGORY_DATA : monthExpenseCategoryData;
  const incomeNatureData = granularity === "year" ? yearData?.incomeNatureData ?? [] : monthIncomeNatureData;
  const incomeTotal = granularity === "year" ? yearData?.incomeTotal ?? 0 : monthIncomeTotal;
  const incomeCategoryData = granularity === "year" ? yearData?.incomeCategoryData ?? EMPTY_CATEGORY_DATA : monthIncomeCategoryData;
  const accountTypeData = granularity === "year" ? yearData?.accountTypeData ?? [] : monthAccountTypeData;
  const accountTypeTotal = granularity === "year" ? yearData?.accountTypeTotal ?? 0 : monthAccountTypeTotal;
  const rangeStart = granularity === "year" ? yearData?.rangeStart ?? selected.start : selected.start;
  const rangeEnd = granularity === "year" ? yearData?.rangeEnd ?? selected.end : selected.end;
  const periodLabel = granularity === "year" ? yearData?.label ?? String(selectedYear) : selected.label;

  return (
    <>
      <div className="mb-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Trailing 12 months — income vs. expense</h2>
          <CashFlowTrendChart
            data={cashFlowTrendData}
            selectedIndex={granularity === "month" ? selectedIndex : undefined}
            onSelectMonth={(i) => {
              setGranularity("month");
              setSelectedIndex(i);
            }}
          />
        </Card>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-900">Breakdown analysis — {periodLabel}</h2>

          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {(["month", "year"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={clsx("rounded px-2 py-1 font-medium capitalize transition-colors", granularity === g ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
              >
                {g}
              </button>
            ))}
          </div>

          {granularity === "month" ? (
            <select
              value={selectedIndex}
              onChange={(e) => setSelectedIndex(Number(e.target.value))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
              aria-label="Choose a month"
            >
              {months.map((m, i) => (
                <option key={m.label} value={i}>
                  {m.label}
                </option>
              ))}
            </select>
          ) : (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
              aria-label="Choose a year"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          )}

          {yearLoading && <span className="text-xs text-slate-400">loading…</span>}
          {granularity === "month" && <span className="text-xs text-slate-400">click a bar above, or pick a month</span>}
          {granularity === "month" && !isLatestMonth && (
            <button
              type="button"
              onClick={() => setSelectedIndex(months.length - 1)}
              className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
            >
              Back to latest month
            </button>
          )}
        </div>
        <div className={clsx("grid grid-cols-1 gap-6 lg:grid-cols-2 transition-opacity", yearLoading && "opacity-50")}>
          <Card>
            <BreakdownCard
              title={granularity === "month" ? "This month's expense" : "This year's expense"}
              natureData={expenseNatureData}
              natureTotal={expenseTotal}
              accountTypeData={accountTypeData}
              accountTypeTotal={accountTypeTotal}
              categoryData={expenseCategoryData}
              categoryAccent={FLOW_COLORS.expense}
              categoryRangeStart={rangeStart}
              categoryRangeEnd={rangeEnd}
              periodLabel={periodLabel}
            />
          </Card>
          <Card>
            <BreakdownCard
              title={granularity === "month" ? "This month's income" : "This year's income"}
              natureData={incomeNatureData}
              natureTotal={incomeTotal}
              categoryData={incomeCategoryData}
              categoryAccent={FLOW_COLORS.income}
              categoryRangeStart={rangeStart}
              categoryRangeEnd={rangeEnd}
              periodLabel={periodLabel}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
