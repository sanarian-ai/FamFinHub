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

/**
 * Action 4: "Discard forever" — opt this description pattern out of the Review Queue
 * permanently. Deliberately does NOT change the underlying transactions' status (they stay
 * `needs_review` — still honestly uncategorized), it just records the pattern in
 * ReviewDismissal so the queue (and the Dashboard's needs-review count) excludes any matching
 * row, present or future, on every subsequent load. Upsert so re-discarding after a restore
 * just refreshes the sample/count rather than erroring on the unique constraint.
 */
export async function discardGroupForeverAction(groupKey: string, sampleDescription: string) {
  const ids = await getGroupTransactionIds(groupKey);

  await prisma.reviewDismissal.upsert({
    where: { descriptionKey: groupKey },
    create: { descriptionKey: groupKey, sampleDescription, dismissedCount: ids.length },
    update: { sampleDescription, dismissedCount: ids.length },
  });

  revalidatePath("/review");
  revalidatePath("/");
}

/** Undoes a "Discard forever" — the pattern's matching transactions reappear in the queue. */
export async function restoreDismissalAction(id: string) {
  await prisma.reviewDismissal.delete({ where: { id } });
  revalidatePath("/review");
  revalidatePath("/");
}

/**
 * Bulk-categorizes every transaction across several selected description-groups at once,
 * with an optional standing "contains" rule creation —
 * used by the Review Queue's keyword search: filter to everything containing e.g. "swiggy",
 * select all matching groups, categorize them, and optionally create one CategoryRule so
 * future imports with that keyword never reach the queue at all. Runs both writes in a
 * single transaction so a bulk categorize never partially applies without its rule.
 */
export async function bulkCategorizeWithOptionalRuleAction(
  groupKeys: string[],
  categoryId: string,
  containsRulePattern?: string
) {
  if (!categoryId || !groupKeys || groupKeys.length === 0) return;

  const rows = await prisma.transaction.findMany({
    where: { status: "needs_review" },
    select: { id: true, rawDescription: true },
  });
  const keySet = new Set(groupKeys);
  const ids = rows.filter((r) => keySet.has(normalizeDescriptionKey(r.rawDescription))).map((r) => r.id);

  const trimmedPattern = containsRulePattern?.trim().toLowerCase();
  // Guard against an accidental 1-2 character rule that would silently over-match unrelated
  // future transactions — same "never fail silently, never over-broadly" bar as the rest of
  // this app's rule mining.
  const shouldCreateRule = !!trimmedPattern && trimmedPattern.length >= 3;

  const ops = [];
  if (ids.length > 0) {
    ops.push(
      prisma.transaction.updateMany({
        where: { id: { in: ids } },
        data: { categoryId, status: "categorized", suggestedCategoryId: null, suggestionReason: null },
      })
    );
  }
  if (shouldCreateRule) {
    ops.push(
      prisma.categoryRule.create({
        data: {
          matchType: "contains",
          pattern: trimmedPattern!,
          categoryId,
          priority: 150, // after all exact rules (100) — an exact historical match always wins first
          source: "user_defined",
        },
      })
    );
  }
  if (ops.length > 0) await prisma.$transaction(ops);

  revalidatePath("/review");
  revalidatePath("/");
}
