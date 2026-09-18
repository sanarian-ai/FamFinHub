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
function expenditureWhere(start: Date, end: Date): Prisma.TransactionWhereInput {
  return {
    txnDate: { gte: start, lt: end },
    amount: { lt: 0 },
    category: { expenseType: { expenseNature: { is: { accountType: "Expenditure" } } } },
  };
}

export async function getExpenditureRows(start: Date, end: Date): Promise<ExpenditureRow[]> {
  const txns = await prisma.transaction.findMany({
    where: expenditureWhere(start, end),
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

export async function getExpenditureTotal(start: Date, end: Date): Promise<number> {
  const agg = await prisma.transaction.aggregate({
    _sum: { amount: true },
    where: expenditureWhere(start, end),
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
    prisma.transaction.findMany({ where: { status: "needs_review" }, select: { rawDescription: true } }),
    prisma.reviewDismissal.findMany({ select: { descriptionKey: true } }),
  ]);
  const dismissedKeys = new Set(dismissals.map((d) => d.descriptionKey));
  return rows.filter((r) => !dismissedKeys.has(normalizeDescriptionKey(r.rawDescription))).length;
}
