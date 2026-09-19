"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import clsx from "clsx";
import { formatINR } from "@/lib/format";
import { Card, StatTile } from "@/components/ui";
import { CashFlowTrendChart, type CashFlowDatum } from "./CashFlowTrendChart";
import { BreakdownCard } from "./BreakdownCard";
import { FLOW_COLORS } from "./colors";
import { sumByNature, sumByCategoryRanked, sumByAccountType, sumByAccount, filterRowsInRange, type RankedCategoryTotals } from "./aggregate";
import { getYearBreakdownAction, type YearBreakdown } from "./actions";
import { HouseholdSplit } from "./HouseholdSplit";
import type { ExpenditureRow, IncomeRow, InvestmentRow, AccountTypeRow, UncategorizedFlowRow, HolderCashFlow } from "./queries";
import type { PeriodRange, Holder } from "./period";
import { HOLDERS } from "./period";

type Granularity = "month" | "year";
type IndexRange = { start: number; end: number }; // inclusive both ends

const EMPTY_CATEGORY_DATA: RankedCategoryTotals = { items: [], otherTotal: 0, otherCount: 0 };

/**
 * Owns the "which trailing months (or which span of calendar years) is drilled into" state and
 * everything downstream of it: the clickable trend chart, the Month/Year toggle, the From/To
 * range pickers, and the Expense/Income/Investment composition cards below it. Lives as one
 * client component (rather than page.tsx wiring several independent client pieces together)
 * because the trend chart and the three composition cards all need to share that selection
 * instantly.
 *
 * The range is always contiguous (never an arbitrary multi-select) — a deliberate call made
 * with Sangeeth before building this, specifically because it keeps both Month and Year mode
 * simple: a contiguous span is just one wider [start, end) window, not a merge of several
 * separately-fetched/cached periods. That matters most for the Category tab's top-8 ranking,
 * which can't be correctly reconstructed by combining several already-truncated top-8 lists,
 * and for the "click a category to view it in the Ledger" links below, which need one
 * contiguous date range to point at — both would break for a non-contiguous pick.
 *
 * Month mode re-slices a single trailing-12-month row set fetched once, server-side, in
 * page.tsx — every selection change just re-filters/re-aggregates that same in-memory data, no
 * round trip. Year mode is different: the app holds ~14 years of transaction history, well
 * outside that trailing window, so picking a year span fetches + aggregates on demand via a
 * Server Action (see actions.ts) and caches the result per exact (startYear, endYear) pair for
 * the rest of the session.
 */
export function CashFlowSection({
  months,
  availableYears,
  cashFlowTrendData,
  trailingExpenditureRows,
  trailingIncomeRows,
  trailingAccountTypeRows,
  trailingInvestmentRows,
  trailingUncategorizedRows,
  holder,
}: {
  months: PeriodRange[];
  /** Every calendar year with transaction history, descending (most recent first). */
  availableYears: number[];
  cashFlowTrendData: CashFlowDatum[];
  trailingExpenditureRows: ExpenditureRow[];
  trailingIncomeRows: IncomeRow[];
  trailingAccountTypeRows: AccountTypeRow[];
  trailingInvestmentRows: InvestmentRow[];
  /** Household-wide, unfiltered by holder — only populated (by page.tsx) in household view;
   *  empty array in solo view, where the Household split card never renders. */
  trailingUncategorizedRows: UncategorizedFlowRow[];
  holder?: Holder;
}) {
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [monthRange, setMonthRange] = useState<IndexRange>({ start: months.length - 1, end: months.length - 1 });
  const [yearRange, setYearRange] = useState<IndexRange>({ start: availableYears[0], end: availableYears[0] }); // in this one, start/end are the years themselves, not indices
  const [yearData, setYearData] = useState<YearBreakdown | null>(null);
  const [isPending, startTransition] = useTransition();
  const yearCache = useRef(new Map<string, YearBreakdown>());

  const isLatestMonth = monthRange.start === months.length - 1 && monthRange.end === months.length - 1;
  const isLatestYear = yearRange.start === availableYears[0] && yearRange.end === availableYears[0];

  // Combined PeriodRange spanning the whole selected month range — filterRowsInRange doesn't
  // care whether this is one month or several, so nothing downstream of this needs to know.
  const selectedMonthRange: PeriodRange = useMemo(() => {
    const first = months[monthRange.start];
    const last = months[monthRange.end];
    return {
      start: first.start,
      end: last.end,
      label: monthRange.start === monthRange.end ? first.label : `${first.label} – ${last.label}`,
    };
  }, [months, monthRange]);

  // --- Month mode: instant client-side slice of the trailing-12-month fetch already in memory.
  const monthExpenditureRows = useMemo(() => filterRowsInRange(trailingExpenditureRows, selectedMonthRange), [trailingExpenditureRows, selectedMonthRange]);
  const monthIncomeRows = useMemo(() => filterRowsInRange(trailingIncomeRows, selectedMonthRange), [trailingIncomeRows, selectedMonthRange]);
  const monthInvestmentRows = useMemo(() => filterRowsInRange(trailingInvestmentRows, selectedMonthRange), [trailingInvestmentRows, selectedMonthRange]);
  const monthAccountTypeRows = useMemo(() => filterRowsInRange(trailingAccountTypeRows, selectedMonthRange), [trailingAccountTypeRows, selectedMonthRange]);

  const monthExpenseNatureData = useMemo(() => sumByNature(monthExpenditureRows), [monthExpenditureRows]);
  const monthExpenseTotal = useMemo(() => monthExpenditureRows.reduce((s, r) => s + r.amount, 0), [monthExpenditureRows]);
  const monthExpenseCategoryData = useMemo(() => sumByCategoryRanked(monthExpenditureRows), [monthExpenditureRows]);

  const monthIncomeNatureData = useMemo(() => sumByNature(monthIncomeRows), [monthIncomeRows]);
  const monthIncomeTotal = useMemo(() => monthIncomeRows.reduce((s, r) => s + r.amount, 0), [monthIncomeRows]);
  const monthIncomeCategoryData = useMemo(() => sumByCategoryRanked(monthIncomeRows), [monthIncomeRows]);

  const monthInvestmentNatureData = useMemo(() => sumByNature(monthInvestmentRows), [monthInvestmentRows]);
  const monthInvestmentTotal = useMemo(() => monthInvestmentRows.reduce((s, r) => s + r.amount, 0), [monthInvestmentRows]);
  const monthInvestmentCategoryData = useMemo(() => sumByCategoryRanked(monthInvestmentRows), [monthInvestmentRows]);

  const monthAccountTypeData = useMemo(() => sumByAccountType(monthAccountTypeRows), [monthAccountTypeRows]);
  const monthAccountTypeTotal = useMemo(() => monthAccountTypeData.reduce((s, d) => s + d.total, 0), [monthAccountTypeData]);

  // --- Household split (Month mode): derived from the same trailing rows already in memory,
  // sliced to the selected range, grouped by accountHolder — no round trip. Uncategorized rows
  // are folded in by sign, replicating getCashFlowSummary's rule ("headline totals must be
  // correct irrespective of the bucket"), which is why trailingUncategorizedRows exists as its
  // own household-wide fetch (see page.tsx / queries.ts) rather than being derivable from the
  // Expenditure/Income rows alone. Meaningless (and unused) in solo view, where holder is set.
  const MIN_INCOME_FOR_SAVINGS_RATE = 5000;
  const monthUncategorizedRows = useMemo(
    () => filterRowsInRange(trailingUncategorizedRows, selectedMonthRange),
    [trailingUncategorizedRows, selectedMonthRange]
  );
  const monthHolderSplit: HolderCashFlow[] = useMemo(() => {
    return HOLDERS.map((h) => {
      let income = monthIncomeRows.filter((r) => r.accountHolder === h).reduce((s, r) => s + r.amount, 0);
      let expense = monthExpenditureRows.filter((r) => r.accountHolder === h).reduce((s, r) => s + r.amount, 0);
      for (const r of monthUncategorizedRows) {
        if (r.accountHolder !== h) continue;
        if (r.amount > 0) income += r.amount;
        else expense += -r.amount;
      }
      const net = income - expense;
      const savingsRate = income > MIN_INCOME_FOR_SAVINGS_RATE ? (net / income) * 100 : null;
      return { holder: h, income, expense, net, savingsRate };
    });
  }, [monthIncomeRows, monthExpenditureRows, monthUncategorizedRows]);
  const monthAccountsByHolder = useMemo(() => {
    return Object.fromEntries(HOLDERS.map((h) => [h, sumByAccount(monthExpenditureRows.filter((r) => r.accountHolder === h))])) as Record<
      Holder,
      ReturnType<typeof sumByAccount>
    >;
  }, [monthExpenditureRows]);

  // --- Year mode: fetch on demand (once per exact year span, then cached) via the Server Action.
  useEffect(() => {
    if (granularity !== "year") return;
    const key = `${yearRange.start}-${yearRange.end}`;
    const cached = yearCache.current.get(key);
    if (cached) {
      setYearData(cached);
      return;
    }
    startTransition(async () => {
      const data = await getYearBreakdownAction(yearRange.start, yearRange.end, holder);
      yearCache.current.set(key, data);
      setYearData(data);
    });
  }, [granularity, yearRange, holder]);

  const yearLoading =
    granularity === "year" && (isPending || !yearData || yearData.startYear !== yearRange.start || yearData.endYear !== yearRange.end);

  // --- Whichever mode is active, converge on one set of values the cards below render.
  const expenseNatureData = granularity === "year" ? yearData?.expenseNatureData ?? [] : monthExpenseNatureData;
  const expenseTotal = granularity === "year" ? yearData?.expenseTotal ?? 0 : monthExpenseTotal;
  const expenseCategoryData = granularity === "year" ? yearData?.expenseCategoryData ?? EMPTY_CATEGORY_DATA : monthExpenseCategoryData;
  const incomeNatureData = granularity === "year" ? yearData?.incomeNatureData ?? [] : monthIncomeNatureData;
  const incomeTotal = granularity === "year" ? yearData?.incomeTotal ?? 0 : monthIncomeTotal;
  const incomeCategoryData = granularity === "year" ? yearData?.incomeCategoryData ?? EMPTY_CATEGORY_DATA : monthIncomeCategoryData;
  const investmentNatureData = granularity === "year" ? yearData?.investmentNatureData ?? [] : monthInvestmentNatureData;
  const investmentTotal = granularity === "year" ? yearData?.investmentTotal ?? 0 : monthInvestmentTotal;
  const investmentCategoryData = granularity === "year" ? yearData?.investmentCategoryData ?? EMPTY_CATEGORY_DATA : monthInvestmentCategoryData;
  const accountTypeData = granularity === "year" ? yearData?.accountTypeData ?? [] : monthAccountTypeData;
  const accountTypeTotal = granularity === "year" ? yearData?.accountTypeTotal ?? 0 : monthAccountTypeTotal;
  const rangeStart = granularity === "year" ? yearData?.rangeStart ?? selectedMonthRange.start : selectedMonthRange.start;
  const rangeEnd = granularity === "year" ? yearData?.rangeEnd ?? selectedMonthRange.end : selectedMonthRange.end;
  const periodLabel =
    granularity === "year" ? yearData?.label ?? (yearRange.start === yearRange.end ? String(yearRange.start) : `${yearRange.start}–${yearRange.end}`) : selectedMonthRange.label;
  const holderSplit = granularity === "year" ? yearData?.holderSplit ?? [] : monthHolderSplit;
  const accountsByHolder = granularity === "year" ? yearData?.accountsByHolder ?? {} : monthAccountsByHolder;

  function selectSingleMonth(index: number) {
    setGranularity("month");
    setMonthRange({ start: index, end: index });
  }

  return (
    <>
      <div className="mb-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Trailing 12 months — income vs. expense</h2>
          <CashFlowTrendChart
            data={cashFlowTrendData}
            selectedRange={granularity === "month" ? monthRange : undefined}
            onSelectMonth={selectSingleMonth}
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
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>from</span>
              <select
                value={monthRange.start}
                onChange={(e) => {
                  const start = Number(e.target.value);
                  setMonthRange((r) => ({ start, end: Math.max(start, r.end) }));
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                aria-label="From month"
              >
                {months.map((m, i) => (
                  <option key={m.label} value={i}>
                    {m.label}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                value={monthRange.end}
                onChange={(e) => {
                  const end = Number(e.target.value);
                  setMonthRange((r) => ({ start: Math.min(r.start, end), end }));
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                aria-label="To month"
              >
                {months.map((m, i) => (
                  <option key={m.label} value={i}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <span>from</span>
              <select
                value={yearRange.start}
                onChange={(e) => {
                  const start = Number(e.target.value);
                  setYearRange((r) => ({ start, end: Math.max(start, r.end) }));
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                aria-label="From year"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
              <span>to</span>
              <select
                value={yearRange.end}
                onChange={(e) => {
                  const end = Number(e.target.value);
                  setYearRange((r) => ({ start: Math.min(r.start, end), end }));
                }}
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700"
                aria-label="To year"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
          )}

          {yearLoading && <span className="text-xs text-slate-400">loading…</span>}
          {granularity === "month" && <span className="text-xs text-slate-400">click a bar above, or pick a from/to range</span>}
          {granularity === "month" && !isLatestMonth && (
            <button
              type="button"
              onClick={() => setMonthRange({ start: months.length - 1, end: months.length - 1 })}
              className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
            >
              Back to latest month
            </button>
          )}
          {granularity === "year" && !isLatestYear && (
            <button
              type="button"
              onClick={() => setYearRange({ start: availableYears[0], end: availableYears[0] })}
              className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
            >
              Back to latest year
            </button>
          )}
        </div>

        <div className={clsx("mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3 transition-opacity", yearLoading && "opacity-50")}>
          <StatTile label={`Income — ${periodLabel}`} value={formatINR(incomeTotal)} positiveIsBad={false} />
          <StatTile label={`Expense — ${periodLabel}`} value={formatINR(expenseTotal)} positiveIsBad={true} />
          <StatTile label={`Investment — ${periodLabel}`} value={formatINR(investmentTotal)} positiveIsBad={false} />
        </div>

        <div className={clsx("grid grid-cols-1 gap-6 lg:grid-cols-3 transition-opacity", yearLoading && "opacity-50")}>
          <Card>
            <BreakdownCard
              title="Expense"
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
              title="Income"
              natureData={incomeNatureData}
              natureTotal={incomeTotal}
              categoryData={incomeCategoryData}
              categoryAccent={FLOW_COLORS.income}
              categoryRangeStart={rangeStart}
              categoryRangeEnd={rangeEnd}
              periodLabel={periodLabel}
            />
          </Card>
          <Card>
            <BreakdownCard
              title="Investment"
              natureData={investmentNatureData}
              natureTotal={investmentTotal}
              categoryData={investmentCategoryData}
              categoryAccent={FLOW_COLORS.investment}
              categoryRangeStart={rangeStart}
              categoryRangeEnd={rangeEnd}
              periodLabel={periodLabel}
            />
          </Card>
        </div>

        {holder === undefined && holderSplit.length > 0 && (
          <div className={clsx("mt-6 transition-opacity", yearLoading && "opacity-50")}>
            <HouseholdSplit holders={holderSplit} accountsByHolder={accountsByHolder} periodLabel={periodLabel} />
          </div>
        )}
      </div>
    </>
  );
}
