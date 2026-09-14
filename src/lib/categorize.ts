import { prisma } from "@/lib/prisma";

/**
 * Matches a raw transaction description against the category_rules table.
 * Rules are tried in ascending `priority` order; first match wins.
 * Used by both the /api/ingest pipeline and the Mapping Admin "test a string" tool.
 */
export async function matchCategoryRule(rawDescription: string) {
  const rules = await prisma.categoryRule.findMany({
    where: { isActive: true },
    orderBy: { priority: "asc" },
    include: { category: true },
  });

  const desc = rawDescription.toLowerCase();

  for (const rule of rules) {
    const pattern = rule.pattern.toLowerCase();
    let isMatch = false;
    try {
      if (rule.matchType === "exact") isMatch = desc.trim() === pattern.trim();
      else if (rule.matchType === "contains") isMatch = desc.includes(pattern);
      else if (rule.matchType === "regex") isMatch = new RegExp(rule.pattern, "i").test(rawDescription);
    } catch {
      isMatch = false;
    }
    if (isMatch) return { rule, category: rule.category };
  }
  return null;
}

export function normalizeDescriptionKey(desc: string) {
  return desc.trim().toLowerCase().replace(/\s+/g, " ");
}
