import { prisma } from "@/lib/prisma";
import { normalizeDescriptionKey } from "@/lib/categorize";
import type { Prisma } from "@prisma/client";

export interface ExpenditureRow {
  amount: number; // positive magnitude (source amounts are negative outflows)
  txnDate: Date;
  categoryId: string;
  categoryName: string;
  natureId: string;
  natureName: string;
  accountId: string | null;
  accountName: string | null;
  accountHolder: string | null;
}

/**
 * Spend = negative amounts whose category rolls up (Category -> ExpenseType
 * -> ExpenseNature) to an Expenditure-type nature. Investment/Income rows and
 * transactions with no category (e.g. needs_review rows awaiting a category)
 * are deliberately excluded — they aren't "spend".
 */
function expenditureWhere(start: Date, end: Date, holder?: import("./period").Holder): Prisma.TransactionWhereInput {
  return {
    txnDate: { gte: start, lt: end },
    amount: { lt: 0 },
    category: { expenseType: { expenseNature: { is: { accountType: "Expenditure" } } } },
    ...(holder ? { account: { holder } } : {}),
  };
}

export async function getExpenditureRows(start: Date, end: Date, holder?: import("./period").Holder): Promise<ExpenditureRow[]> {
  const txns = await prisma.transaction.findMany({
    where: expenditureWhere(start, end, holder),
    select: {
      amount: true,
      txnDate: true,
      categoryId: true,
      category: {
        select: {
          name: true,
          expenseType: { select: { expenseNature: { select: { id: true, name: true } } } },
        },
      },
      accountId: true,
      account: { select: { name: true, holder: true } },
    },
  });
  return txns.map((t) => ({
    amount: Math.abs(Number(t.amount)),
    txnDate: t.txnDate,
    categoryId: t.categoryId as string,
    categoryName: t.category?.name ?? "Uncategorized",
    natureId: t.category?.expenseType.expenseNature.id ?? "unknown",
    natureName: t.category?.expenseType.expenseNature.name ?? "Uncategorized",
    accountId: t.accountId,
    accountName: t.account?.name ?? null,
    accountHolder: t.account?.holder ?? null,
  }));
}

export async function getExpenditureTotal(start: Date, end: Date, holder?: import("./period").Holder): Promise<number> {
  const agg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: expenditureWhere(start, end, holder),
  });
  return Math.abs(Number(agg._sum.amount ?? 0));
}

/**
 * The dev dataset is a fixed migration snapshot that currently ends well
 * before the real calendar date (see project notes). Anchoring the dashboard
 * to the wall clock would make "this month" permanently empty. Instead we
 * anchor to whichever is earlier: today, or the latest transaction on
 * record — so the dashboard always opens on the most recent period that
 * actually has data, exactly like a live app that just hasn't been synced
 * past that date yet.
 */
export async function getEffectiveNow(): Promise<Date> {
  const real = new Date();
  const latest = await prisma.transaction.aggregate({ _max: { txnDate: true } });
  const latestDate = latest._max.txnDate;
  if (!latestDate) return real;
  return latestDate < real ? latestDate : real;
}

// Excludes rows matching a permanent Review Queue dismissal (see ReviewDismissal) — those are
// still technically uncategorized, but the user has explicitly opted out of being nagged about
// them, so they shouldn't inflate the "needs categorization" banner either.
export async function getNeedsReviewCount(): Promise<number> {
  const [rows, dismissals] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "needs_review", txnDate: { gte: REVIEW_NAG_START } },
      select: { rawDescription: true },
    }),
    prisma.reviewDismissal.findMany({ select: { descriptionKey: true } }),
  ]);
  const dismissedKeys = new Set(dismissals.map((d) => d.descriptionKey));
  return rows.filter((r) => !dismissedKeys.has(normalizeDescriptionKey(r.rawDescription))).length;
}

// ---------------------------------------------------------------------------
// Cash flow (income + expense + uncategorized) — added for the household
// income/expense/cash-flow dashboard. See plan doc "Confirmed scope" table.
// ---------------------------------------------------------------------------

import type { Holder } from "./period";

function holderWhere(holder?: Holder): Prisma.TransactionWhereInput {
  return holder ? { account: { holder } } : {};
}

function incomeWhere(start: Date, end: Date, holder?: Holder): Prisma.TransactionWhereInput {
  return {
    txnDate: { gte: start, lt: end },
    amount: { gt: 0 },
    category: { expenseType: { expenseNature: { is: { accountType: "Income" } } } },
    ...holderWhere(holder),
  };
}

// Same shape as ExpenditureRow (amount as positive magnitude, full category/nature/account
// tags) but for Income-type rows — powers the per-month Income composition drill-down. Kept
// as a distinct type alias (not a raw reuse of ExpenditureRow) so call sites read honestly
// about which side of cash flow a given array holds.
export type IncomeRow = ExpenditureRow;

export async function getIncomeRows(start: Date, end: Date, holder?: Holder): Promise<IncomeRow[]> {
  const txns = await prisma.transaction.findMany({
    where: incomeWhere(start, end, holder),
    select: {
      amount: true,
      txnDate: true,
      categoryId: true,
      category: {
        select: {
          name: true,
          expenseType: { select: { expenseNature: { select: { id: true, name: true } } } },
        },
      },
      accountId: true,
      account: { select: { name: true, holder: true } },
    },
  });
  return txns.map((t) => ({
    amount: Math.abs(Number(t.amount)),
    txnDate: t.txnDate,
    categoryId: t.categoryId as string,
    categoryName: t.category?.name ?? "Uncategorized",
    natureId: t.category?.expenseType.expenseNature.id ?? "unknown",
    natureName: t.category?.expenseType.expenseNature.name ?? "Uncategorized",
    accountId: t.accountId,
    accountName: t.account?.name ?? null,
    accountHolder: t.account?.holder ?? null,
  }));
}

// Deliberately NOT scoped to accountType: "Expenditure" only for this helper's callers that
// need every negative-amount categorized row (kept separate from expenditureWhere above,
// which existing Nature/Ledger/TopMovers views still rely on unchanged).
function uncategorizedWhere(start: Date, end: Date, holder?: Holder): Prisma.TransactionWhereInput {
  return { txnDate: { gte: start, lt: end }, categoryId: null, ...holderWhere(holder) };
}

export interface CashFlowSummary {
  income: number;
  expense: number;
  net: number;
  savingsRate: number | null; // net / income, as a percentage; null when income is 0
}

/**
 * Income and Expense for a period, folding in not-yet-categorized transactions by the sign
 * of their amount (positive = income-like, negative = expense-like) — per the confirmed
 * decision that headline totals must be correct "irrespective of the bucket" rather than
 * waiting for the Review Queue to empty out. Category-level breakdowns (Nature donut, Top
 * Movers) are unaffected — they still only show what's actually been categorized.
 */
export async function getCashFlowSummary(start: Date, end: Date, holder?: Holder): Promise<CashFlowSummary> {
  const [incomeAgg, expenseAgg, uncatRows] = await Promise.all([
    prisma.transaction.aggregate({ _sum: { amount: true }, where: incomeWhere(start, end, holder) }),
    prisma.transaction.aggregate({ _sum: { amount: true }, where: expenditureWhere(start, end, holder) }),
    prisma.transaction.findMany({ where: uncategorizedWhere(start, end, holder), select: { amount: true } }),
  ]);

  let uncatIncome = 0;
  let uncatExpense = 0;
  for (const r of uncatRows) {
    const a = Number(r.amount);
    if (a > 0) uncatIncome += a;
    else uncatExpense += -a;
  }

  const income = Number(incomeAgg._sum.amount ?? 0) + uncatIncome;
  const expense = Math.abs(Number(expenseAgg._sum.amount ?? 0)) + uncatExpense;
  const net = income - expense;
  // Below this, income is noise (e.g. early in the month before salary posts) rather than a
  // real base to rate against — a tiny denominator turns an ordinary net into a meaningless
  // six-figure percentage. Show "no reading yet" instead of a number that looks broken.
  const MIN_INCOME_FOR_SAVINGS_RATE = 5000;
  const savingsRate = income > MIN_INCOME_FOR_SAVINGS_RATE ? (net / income) * 100 : null;

  return { income, expense, net, savingsRate };
}

export interface HolderCashFlow extends CashFlowSummary {
  holder: Holder;
}

/** Sangeeth vs. Ria, current period — powers the Household-mode contribution strip and split region. */
export async function getHolderSplit(start: Date, end: Date): Promise<HolderCashFlow[]> {
  const { HOLDERS } = await import("./period");
  return Promise.all(
    HOLDERS.map(async (holder) => {
      const s = await getCashFlowSummary(start, end, holder);
      return { holder, ...s };
    })
  );
}

export interface FlowPoint {
  amount: number; // positive magnitude
  txnDate: Date;
}

/**
 * Raw income vs. expense rows for a range, uncategorized folded in by sign (same rule as
 * getCashFlowSummary). Used for the trailing-12-month cash flow trend chart.
 */
export async function getCashFlowRows(
  start: Date,
  end: Date,
  holder?: Holder
): Promise<{ income: FlowPoint[]; expense: FlowPoint[] }> {
  const [incomeRows, expenseRows, uncatRows] = await Promise.all([
    prisma.transaction.findMany({ where: incomeWhere(start, end, holder), select: { amount: true, txnDate: true } }),
    prisma.transaction.findMany({ where: expenditureWhere(start, end, holder), select: { amount: true, txnDate: true } }),
    prisma.transaction.findMany({ where: uncategorizedWhere(start, end, holder), select: { amount: true, txnDate: true } }),
  ]);

  const income: FlowPoint[] = incomeRows.map((r) => ({ amount: Number(r.amount), txnDate: r.txnDate }));
  const expense: FlowPoint[] = expenseRows.map((r) => ({ amount: Math.abs(Number(r.amount)), txnDate: r.txnDate }));
  for (const r of uncatRows) {
    const a = Number(r.amount);
    if (a > 0) income.push({ amount: a, txnDate: r.txnDate });
    else expense.push({ amount: -a, txnDate: r.txnDate });
  }
  return { income, expense };
}

export interface AccountTypeRow {
  amount: number; // positive magnitude
  accountType: "Expenditure" | "Investment" | "Income";
  txnDate: Date; // lets callers re-slice a wider fetch (e.g. a trailing-12mo window) by month client-side
}

/**
 * Every categorized row in a period, tagged by its nature's accountType — powers the "by
 * Account Type" breakdown toggle. Transfer-type rows (money moved between the household's own
 * accounts, e.g. a credit-card bill payment from savings) are excluded here explicitly — they
 * aren't spend, investment, or income, and this breakdown is specifically framed as those three.
 */
export async function getAccountTypeRows(start: Date, end: Date, holder?: Holder): Promise<AccountTypeRow[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      txnDate: { gte: start, lt: end },
      categoryId: { not: null },
      category: { expenseType: { expenseNature: { is: { accountType: { not: "Transfer" } } } } },
      ...holderWhere(holder),
    },
    select: {
      amount: true,
      txnDate: true,
      category: { select: { expenseType: { select: { expenseNature: { select: { accountType: true } } } } } },
    },
  });
  return rows
    .filter((r) => r.category)
    .map((r) => ({
      amount: Math.abs(Number(r.amount)),
      accountType: r.category!.expenseType.expenseNature.accountType as AccountTypeRow["accountType"],
      txnDate: r.txnDate,
    }));
}

// Dashboard's needs-review nag only counts 2020-onward — per the confirmed decision not to
// chase review of the pre-2020 historical backlog. The Review Queue screen itself is
// unaffected (still browsable/filterable back to 2013) — this only trims what nags.
const REVIEW_NAG_START = new Date(Date.UTC(2020, 0, 1));

export async function getUnattributedTotal(): Promise<number> {
  const agg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: { accountId: null, amount: { lt: 0 } },
  });
  return Math.abs(Number(agg._sum.amount ?? 0));
}

export async function getLastImportSync(): Promise<Date | null> {
  const agg = await prisma.transaction.aggregate({
    _max: { createdAt: true },
    where: { source: { in: ["gmail_daily", "gmail_monthly_reconcile"] } },
  });
  return agg._max.createdAt ?? null;
}
