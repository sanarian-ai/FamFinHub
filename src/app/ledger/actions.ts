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
