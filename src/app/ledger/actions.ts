"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/**
 * Assigns a category to a single transaction (used by the inline-edit dropdown
 * in the Ledger table). Marks the transaction as "categorized" since a human
 * has now confirmed/assigned a category — this is also how a needs_review row
 * gets resolved if someone fixes it directly from the ledger instead of the
 * Review Queue.
 */
export async function updateTransactionCategory(transactionId: string, categoryId: string) {
  if (!transactionId || !categoryId) return;

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { categoryId, status: "categorized" },
  });

  revalidatePath("/ledger");
}

/**
 * Applies one category to a batch of transactions at once (used by the
 * bulk-select "categorize N selected" action).
 */
export async function bulkUpdateCategory(transactionIds: string[], categoryId: string) {
  if (!categoryId || !transactionIds || transactionIds.length === 0) return;

  await prisma.transaction.updateMany({
    where: { id: { in: transactionIds } },
    data: { categoryId, status: "categorized" },
  });

  revalidatePath("/ledger");
}

/**
 * Sets or clears which calendar month a transaction counts toward for Dashboard/Insights
 * reporting (the "Counts toward" control in the Ledger table) — see schema.prisma's comment on
 * `effectiveMonth`. `month` is a "YYYY-MM" string (from a native <input type="month">) or null
 * to clear the override and fall back to the real txnDate. The real txnDate itself is never
 * touched by this — it stays the immutable imported date.
 */
export async function updateTransactionEffectiveMonth(transactionId: string, month: string | null) {
  if (!transactionId) return;
  if (month != null && !/^\d{4}-\d{2}$/.test(month)) return;

  const effectiveMonth = month ? new Date(`${month}-01T00:00:00.000Z`) : null;

  await prisma.transaction.update({
    where: { id: transactionId },
    data: { effectiveMonth },
  });

  revalidatePath("/ledger");
}

/**
 * Permanently deletes a batch of transactions (used by the Ledger's "Delete N selected" bulk
 * action — the intended use case is clearing out duplicate imports, e.g. the same statement
 * pulled in twice by both the Gmail parser and a CSV import). Irreversible — the caller is
 * expected to confirm with the user before invoking this.
 *
 * A transaction that's been linked to a portfolio contribution (FundingLink — see schema.prisma)
 * can't be deleted: the FK has no cascade, so it's excluded from the batch up front rather than
 * letting the whole deleteMany() fail on one blocked row. Returns counts so the UI can tell the
 * user when some of their selection was skipped and why, instead of silently deleting less than
 * they asked for.
 */
export async function bulkDeleteTransactions(
  transactionIds: string[]
): Promise<{ deletedCount: number; skippedCount: number }> {
  if (!transactionIds || transactionIds.length === 0) return { deletedCount: 0, skippedCount: 0 };

  const linked = await prisma.fundingLink.findMany({
    where: { transactionId: { in: transactionIds } },
    select: { transactionId: true },
  });
  const linkedIds = new Set(linked.map((l) => l.transactionId));
  const deletableIds = transactionIds.filter((id) => !linkedIds.has(id));

  const result = deletableIds.length > 0
    ? await prisma.transaction.deleteMany({ where: { id: { in: deletableIds } } })
    : { count: 0 };

  revalidatePath("/ledger");

  return { deletedCount: result.count, skippedCount: transactionIds.length - result.count };
}
