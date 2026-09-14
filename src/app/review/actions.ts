"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { matchCategoryRule, normalizeDescriptionKey } from "@/lib/categorize";

/**
 * All Review Queue transactions are grouped client-side by normalized description
 * (there's no stored "group key" column), so every action re-derives the set of
 * transaction ids belonging to a group by re-normalizing rawDescription in JS.
 * The needs_review table is small (a few hundred rows at most, by design — this
 * queue is meant to shrink to zero) so this is cheap.
 */
async function getGroupTransactionIds(groupKey: string): Promise<string[]> {
  const rows = await prisma.transaction.findMany({
    where: { status: "needs_review" },
    select: { id: true, rawDescription: true },
  });
  return rows.filter((r) => normalizeDescriptionKey(r.rawDescription) === groupKey).map((r) => r.id);
}

/** Action 1: "Accept suggestion" — categorize the whole group using the live rule match. */
export async function acceptSuggestionAction(groupKey: string) {
  const ids = await getGroupTransactionIds(groupKey);
  if (ids.length === 0) return;

  const sample = await prisma.transaction.findFirst({ where: { id: { in: ids } } });
  if (!sample) return;

  const match = await matchCategoryRule(sample.rawDescription);
  if (!match) {
    throw new Error("No rule matches this description anymore — pick a category instead.");
  }

  await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { categoryId: match.category.id, status: "categorized", suggestedCategoryId: null, suggestionReason: null },
  });

  revalidatePath("/review");
}

/** Action 2: "Pick a category" — categorize just this batch, no rule created. */
export async function categorizeGroupAction(groupKey: string, categoryId: string) {
  if (!categoryId) throw new Error("Choose a category first.");
  const ids = await getGroupTransactionIds(groupKey);
  if (ids.length === 0) return;

  await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { categoryId, status: "categorized", suggestedCategoryId: null, suggestionReason: null },
  });

  revalidatePath("/review");
}

/** Action 3 (primary): "Always categorize like this" — categorize the batch AND create a standing rule. */
export async function categorizeAndCreateRuleAction(groupKey: string, categoryId: string) {
  if (!categoryId) throw new Error("Choose a category first.");
  const ids = await getGroupTransactionIds(groupKey);
  if (ids.length === 0) return;

  await prisma.$transaction([
    prisma.transaction.updateMany({
      where: { id: { in: ids } },
      data: { categoryId, status: "categorized", suggestedCategoryId: null, suggestionReason: null },
    }),
    prisma.categoryRule.create({
      data: {
        matchType: "exact",
        pattern: groupKey,
        categoryId,
        priority: 100,
        source: "review_queue_created",
      },
    }),
  ]);

  revalidatePath("/review");
}
