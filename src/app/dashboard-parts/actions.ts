"use server";

import { getExpenditureRows, getIncomeRows, getInvestmentRows, getAccountTypeRows } from "./queries";
import { sumByNature, sumByCategoryRanked, sumByAccountType, type NatureTotal, type AccountTypeTotal, type RankedCategoryTotals } from "./aggregate";
import { calYearRange, type Holder } from "./period";

export interface YearBreakdown {
  startYear: number;
  endYear: number;
  label: string;
  rangeStart: Date;
  rangeEnd: Date;
  expenseNatureData: NatureTotal[];
  expenseTotal: number;
  expenseCategoryData: RankedCategoryTotals;
  incomeNatureData: NatureTotal[];
  incomeTotal: number;
  incomeCategoryData: RankedCategoryTotals;
  investmentNatureData: NatureTotal[];
  investmentTotal: number;
  investmentCategoryData: RankedCategoryTotals;
  accountTypeData: AccountTypeTotal[];
  accountTypeTotal: number;
}

/**
 * On-demand fetch + aggregation for Year mode in the trailing-12-months drill-down (see
 * CashFlowSection). Month mode re-slices a single trailing-12-month row set already sitting in
 * the browser — instant, no round trip — but a calendar year (or span of years) falls outside
 * that window (the app holds ~14 years of transaction history), so this queries + aggregates
 * server-side and ships back only the summarized totals rather than every row.
 *
 * Takes a startYear/endYear pair rather than a single year so a *contiguous* multi-year
 * selection (e.g. 2023-2025) is just one wider query — not a merge of several cached
 * single-year fetches. That merge would have been genuinely wrong for the Category tab: you
 * can't correctly reconstruct "top 8 categories across 2023-2025" by combining three already-
 * truncated "top 8 of 2023" / "top 8 of 2024" / "top 8 of 2025" lists (a category ranked #9 in
 * every single year could still be a true top-8 category summed across all three) — see the
 * proposal discussed with Sangeeth before building this. A single query avoids the problem
 * entirely by never truncating before ranking. startYear === endYear for the common single-year
 * case; the range collapses to exactly the old single-year behavior.
 */
export async function getYearBreakdownAction(startYear: number, endYear: number, holder?: Holder): Promise<YearBreakdown> {
  const rangeStart = calYearRange(new Date(Date.UTC(startYear, 0, 1))).start;
  const rangeEnd = calYearRange(new Date(Date.UTC(endYear, 0, 1))).end;
  const label = startYear === endYear ? `Jan–Dec ${startYear}` : `${startYear}–${endYear}`;

  const [expenditureRows, incomeRows, investmentRows, accountTypeRows] = await Promise.all([
    getExpenditureRows(rangeStart, rangeEnd, holder),
    getIncomeRows(rangeStart, rangeEnd, holder),
    getInvestmentRows(rangeStart, rangeEnd, holder),
    getAccountTypeRows(rangeStart, rangeEnd, holder),
  ]);
  const accountTypeData = sumByAccountType(accountTypeRows);
  return {
    startYear,
    endYear,
    label,
    rangeStart,
    rangeEnd,
    expenseNatureData: sumByNature(expenditureRows),
    expenseTotal: expenditureRows.reduce((s, r) => s + r.amount, 0),
    expenseCategoryData: sumByCategoryRanked(expenditureRows),
    incomeNatureData: sumByNature(incomeRows),
    incomeTotal: incomeRows.reduce((s, r) => s + r.amount, 0),
    incomeCategoryData: sumByCategoryRanked(incomeRows),
    investmentNatureData: sumByNature(investmentRows),
    investmentTotal: investmentRows.reduce((s, r) => s + r.amount, 0),
    investmentCategoryData: sumByCategoryRanked(investmentRows),
    accountTypeData,
    accountTypeTotal: accountTypeData.reduce((s, d) => s + d.total, 0),
  };
}
