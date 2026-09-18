import { prisma } from "@/lib/prisma";
import type { Category, CategoryRule } from "@prisma/client";

type RuleWithCategory = CategoryRule & { category: Category };

/**
 * Pure, DB-free matcher — call this when you already have the active rule set in hand
 * (e.g. fetched once for a batch/page) instead of re-querying per description. Same
 * matching semantics as matchCategoryRule(), just without the per-call findMany().
 */
export function matchCategoryRuleFromList(
  rawDescription: string,
  rules: RuleWithCategory[],
) {
  const desc = rawDescription.toLowerCase();

  for (const rule of rules) {
    const pattern = rule.pattern.toLowerCase();
    let isMatch = false;
    try {
      if (rule.matchType === "exact") isMatch = desc.trim() === pattern.trim();
      else if (rule.matchType === "contains") isMatch = desc.includes(pattern);
      else if (rule.matchType === "regex")
        isMatch = new RegExp(rule.pattern, "i").test(rawDescription);
    } catch {
      isMatch = false;
    }
    if (isMatch) return { rule, category: rule.category };
  }
  return null;
}

export async function fetchActiveCategoryRules(): Promise<RuleWithCategory[]> {
  return prisma.categoryRule.findMany({
    where: { isActive: true },
    orderBy: { priority: "asc" },
    include: { category: true },
  });
}

/**
 * Matches a raw transaction description against the category_rules table.
 * Rules are tried in ascending `priority` order; first match wins.
 *
 * Convenience wrapper for single-shot call sites (the Mapping Admin "test a string" tool,
 * a single review-queue row action, one ingest row processed on its own). Fetches the rule
 * set fresh on every call — fine for one call, NOT for a loop. A caller that needs to match
 * many descriptions in the same request (the review queue's group list, /api/ingest's batch
 * loop) must call fetchActiveCategoryRules() once and use matchCategoryRuleFromList() per
 * item instead — otherwise each iteration re-fetches the identical rule set, and N items
 * means N wasted round trips (fanned out via Promise.all, this is exactly what exhausted the
 * Prisma connection pool on the Review Queue once description groups passed a few hundred).
 */
export async function matchCategoryRule(rawDescription: string) {
  const rules = await fetchActiveCategoryRules();
  return matchCategoryRuleFromList(rawDescription, rules);
}

export function normalizeDescriptionKey(desc: string) {
  return desc.trim().toLowerCase().replace(/\s+/g, " ");
}
