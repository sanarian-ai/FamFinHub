"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui";
import { CashFlowTrendChart, type CashFlowDatum } from "./CashFlowTrendChart";
import { BreakdownCard } from "./BreakdownCard";
import { FLOW_COLORS } from "./colors";
import { sumByNature, sumByCategoryRanked, sumByAccountType, filterRowsInRange, type NatureTotal, type AccountTypeTotal } from "./aggregate";
import type { ExpenditureRow, IncomeRow, AccountTypeRow } from "./queries";
import type { PeriodRange } from "./period";

/**
 * Owns the "which trailing month is drilled into" state and everything downstream of it: the
 * clickable trend chart, and the Expense/Income composition cards below it. Lives as one client
 * component (rather than page.tsx wiring several independent client pieces together) because
 * the trend chart and the two composition cards all need to share that selection instantly,
 * with no server round trip per click — see the plan discussed with Sangeeth before building
 * this. All the row-level data for the full trailing-12-month window is fetched once,
 * server-side, in page.tsx and passed down; every click here just re-filters/re-aggregates
 * that same in-memory data for the newly selected month.
 */
export function CashFlowSection({
  months,
  cashFlowTrendData,
  trailingExpenditureRows,
  trailingIncomeRows,
  trailingAccountTypeRows,
  topNatureData,
  topNatureTotal,
  topAccountTypeData,
  topAccountTypeTotal,
  topPeriodLabel,
}: {
  months: PeriodRange[];
  cashFlowTrendData: CashFlowDatum[];
  trailingExpenditureRows: ExpenditureRow[];
  trailingIncomeRows: IncomeRow[];
  trailingAccountTypeRows: AccountTypeRow[];
  // The existing, unchanged top-of-page breakdown — still scoped to whatever the page's
  // Period selector (Month/Year/FY) is set to, independent of the month drill-down below.
  topNatureData: NatureTotal[];
  topNatureTotal: number;
  topAccountTypeData: AccountTypeTotal[];
  topAccountTypeTotal: number;
  topPeriodLabel: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(months.length - 1); // latest month, by default

  const selected = months[selectedIndex];

  const monthExpenditureRows = useMemo(() => filterRowsInRange(trailingExpenditureRows, selected), [trailingExpenditureRows, selected]);
  const monthIncomeRows = useMemo(() => filterRowsInRange(trailingIncomeRows, selected), [trailingIncomeRows, selected]);
  const monthAccountTypeRows = useMemo(() => filterRowsInRange(trailingAccountTypeRows, selected), [trailingAccountTypeRows, selected]);

  const expenseNatureData = useMemo(() => sumByNature(monthExpenditureRows), [monthExpenditureRows]);
  const expenseTotal = useMemo(() => monthExpenditureRows.reduce((s, r) => s + r.amount, 0), [monthExpenditureRows]);
  const expenseCategoryData = useMemo(() => sumByCategoryRanked(monthExpenditureRows), [monthExpenditureRows]);

  const incomeNatureData = useMemo(() => sumByNature(monthIncomeRows), [monthIncomeRows]);
  const incomeTotal = useMemo(() => monthIncomeRows.reduce((s, r) => s + r.amount, 0), [monthIncomeRows]);
  const incomeCategoryData = useMemo(() => sumByCategoryRanked(monthIncomeRows), [monthIncomeRows]);

  const monthAccountTypeData = useMemo(() => sumByAccountType(monthAccountTypeRows), [monthAccountTypeRows]);
  const monthAccountTypeTotal = useMemo(() => monthAccountTypeData.reduce((s, d) => s + d.total, 0), [monthAccountTypeData]);

  const isLatest = selectedIndex === months.length - 1;

  return (
    <>
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-900">Trailing 12 months — income vs. expense</h2>
          <CashFlowTrendChart data={cashFlowTrendData} selectedIndex={selectedIndex} onSelectMonth={setSelectedIndex} />
        </Card>
        <Card>
          <BreakdownCard
            natureData={topNatureData}
            natureTotal={topNatureTotal}
            accountTypeData={topAccountTypeData}
            accountTypeTotal={topAccountTypeTotal}
            periodLabel={topPeriodLabel}
          />
        </Card>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Month breakdown — {selected.label}</h2>
          <span className="text-xs text-slate-400">click a bar above to explore a different month</span>
          {!isLatest && (
            <button
              type="button"
              onClick={() => setSelectedIndex(months.length - 1)}
              className="ml-auto text-xs font-medium text-indigo-600 hover:underline"
            >
              Back to latest month
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <BreakdownCard
              title="This month's expense"
              natureData={expenseNatureData}
              natureTotal={expenseTotal}
              accountTypeData={monthAccountTypeData}
              accountTypeTotal={monthAccountTypeTotal}
              categoryData={expenseCategoryData}
              categoryAccent={FLOW_COLORS.expense}
              categoryRangeStart={selected.start}
              categoryRangeEnd={selected.end}
              periodLabel={selected.label}
            />
          </Card>
          <Card>
            <BreakdownCard
              title="This month's income"
              natureData={incomeNatureData}
              natureTotal={incomeTotal}
              categoryData={incomeCategoryData}
              categoryAccent={FLOW_COLORS.income}
              categoryRangeStart={selected.start}
              categoryRangeEnd={selected.end}
              periodLabel={selected.label}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
