"use server";

import { getExpenditureRows, getIncomeRows, getAccountTypeRows } from "./queries";
import { sumByNature, sumByCategoryRanked, sumByAccountType, type NatureTotal, type AccountTypeTotal, type RankedCategoryTotals } from "./aggregate";
import { calYearRange, type Holder } from "./period";

export interface YearBreakdown {
  year: number;
  label: string;
  rangeStart: Date;
  rangeEnd: Date;
  expenseNatureData: NatureTotal[];
  expenseTotal: number;
  expenseCategoryData: RankedCategoryTotals;
  incomeNatureData: NatureTotal[];
  incomeTotal: number;
  incomeCategoryData: RankedCategoryTotals;
  accountTypeData: AccountTypeTotal[];
  accountTypeTotal: number;
}

/**
 * On-demand fetch + aggregation for Year mode in the trailing-12-months drill-down (see
 * CashFlowSection). Month mode re-slices a single trailing-12-month row set already sitting in
 * the browser — instant, no round trip — but a calendar year falls outside that window (the
 * app holds ~14 years of transaction history), so this queries + aggregates one year at a time,
 * server-side, and ships back only the summarized totals rather than every row.
 */
export async function getYearBreakdownAction(year: number, holder?: Holder): Promise<YearBreakdown> {
  const range = calYearRange(new Date(Date.UTC(year, 0, 1)));
  const [expenditureRows, incomeRows, accountTypeRows] = await Promise.all([
    getExpenditureRows(range.start, range.end, holder),
    getIncomeRows(range.start, range.end, holder),
    getAccountTypeRows(range.start, range.end, holder),
  ]);
  const accountTypeData = sumByAccountType(accountTypeRows);
  return {
    year,
    label: range.label,
    rangeStart: range.start,
    rangeEnd: range.end,
    expenseNatureData: sumByNature(expenditureRows),
    expenseTotal: expenditureRows.reduce((s, r) => s + r.amount, 0),
    expenseCategoryData: sumByCategoryRanked(expenditureRows),
    incomeNatureData: sumByNature(incomeRows),
    incomeTotal: incomeRows.reduce((s, r) => s + r.amount, 0),
    incomeCategoryData: sumByCategoryRanked(incomeRows),
    accountTypeData,
    accountTypeTotal: accountTypeData.reduce((s, d) => s + d.total, 0),
  };
}
