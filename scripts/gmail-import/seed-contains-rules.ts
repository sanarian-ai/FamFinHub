/**
 * Seeds a small set of `contains`-type category_rules targeting the payment-processor-prefix
 * variance found in email-sourced merchant strings (e.g. "SWIGGY LIMITED", "RAZ*Swiggy",
 * "SWIGGY PVT LTD E COM" — the same merchant, five+ different exact strings) which the
 * existing 444 exact-match rules (mined from bank-statement phrasing) don't cover.
 *
 * Each candidate token below was checked against ALL of your historically-categorized
 * transactions containing it, using the same bar as the original rule-mining pass
 * (>=90% single-category consistency, >=3 real occurrences) — see the analysis this was
 * built from in the 2026-09-03 chat. Only tokens that cleared that bar are seeded; anything
 * mixed (uber 88%, swiggy 79%, flipkart 48%, urbanclap 39%, amazon 18%, bundl 57%, delightful
 * gourmet/reward 360/asspl — too little or too mixed data) is deliberately left OUT so those
 * transactions keep landing in Review Queue rather than getting silently misclassified.
 *
 * Priority 150 (checked after all 444 existing exact rules at priority 100, before these
 * contains rules act as a fallback) — an exact historical match should always win first.
 * Idempotent: skips any pattern that already exists as an active rule.
 *
 * Run: npx tsx scripts/gmail-import/seed-contains-rules.ts
 */
import { prisma } from "../../src/lib/prisma";

const CANDIDATES: { pattern: string; categoryName: string; purity: string; n: number }[] = [
  { pattern: "instamart", categoryName: "Groceries", purity: "99%", n: 198 },
  { pattern: "blinkit", categoryName: "Groceries", purity: "95%", n: 65 },
  { pattern: "prime cut", categoryName: "Meat", purity: "100%", n: 22 },
  { pattern: "hyundai", categoryName: "Car Maintenance", purity: "100%", n: 4 },
];

async function main() {
  for (const c of CANDIDATES) {
    const category = await prisma.category.findUnique({ where: { name: c.categoryName } });
    if (!category) {
      console.log(`SKIP "${c.pattern}" — category "${c.categoryName}" not found`);
      continue;
    }
    const existing = await prisma.categoryRule.findFirst({
      where: { pattern: c.pattern, matchType: "contains", isActive: true },
    });
    if (existing) {
      console.log(`SKIP "${c.pattern}" — rule already exists (id ${existing.id})`);
      continue;
    }
    const rule = await prisma.categoryRule.create({
      data: {
        matchType: "contains",
        pattern: c.pattern,
        categoryId: category.id,
        priority: 150,
        source: "seeded_from_history",
      },
    });
    console.log(`CREATED "${c.pattern}" -> ${c.categoryName} (${c.purity} purity, n=${c.n}) rule id ${rule.id}`);
  }
  await prisma.$disconnect();
}

main();
