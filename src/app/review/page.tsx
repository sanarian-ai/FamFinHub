import { prisma } from "@/lib/prisma";
import { matchCategoryRule, normalizeDescriptionKey } from "@/lib/categorize";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { formatINR, formatDate } from "@/lib/format";
import { ReviewGroupActions, type CategoryOption, type LiveSuggestion } from "./ReviewGroupActions";

// The queue changes every time an action runs (revalidatePath handles that), but it's also
// an operational screen someone lands on repeatedly through the day — never serve a stale cache.
export const dynamic = "force-dynamic";

type Group = {
  key: string;
  representativeDescription: string;
  count: number;
  totalAmount: number;
  earliest: Date;
  latest: Date;
  suggestionReason: string | null;
  suggestion: LiveSuggestion;
  currencies: string[];
};

export default async function ReviewPage() {
  const [needsReview, activeCategories] = await Promise.all([
    prisma.transaction.findMany({
      where: { status: "needs_review" },
      orderBy: { txnDate: "asc" },
    }),
    prisma.category.findMany({
      where: { isActive: true },
      include: { expenseType: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const categoryOptions: CategoryOption[] = activeCategories.map((c) => ({
    id: c.id,
    name: c.name,
    expenseType: c.expenseType.name,
  }));

  // Group by normalized description — this is the core idea of the screen: 86 near-identical
  // "local commute" rows should read as one decision, not 86 separate line items.
  const buckets = new Map<
    string,
    {
      variantCounts: Map<string, number>;
      count: number;
      totalAmount: number;
      earliest: Date;
      latest: Date;
      suggestionReason: string | null;
      currencies: Set<string>;
    }
  >();

  for (const txn of needsReview) {
    const key = normalizeDescriptionKey(txn.rawDescription);
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        variantCounts: new Map(),
        count: 0,
        totalAmount: 0,
        earliest: txn.txnDate,
        latest: txn.txnDate,
        suggestionReason: null,
        currencies: new Set(),
      };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.totalAmount += Number(txn.amount);
    if (txn.txnDate < bucket.earliest) bucket.earliest = txn.txnDate;
    if (txn.txnDate > bucket.latest) bucket.latest = txn.txnDate;
    if (!bucket.suggestionReason && txn.suggestionReason) bucket.suggestionReason = txn.suggestionReason;
    bucket.variantCounts.set(txn.rawDescription, (bucket.variantCounts.get(txn.rawDescription) ?? 0) + 1);
    bucket.currencies.add(txn.currency);
  }

  // Resolve a representative raw-description string per group (the most common exact variant)
  // and check live whether any CategoryRule now matches it — rules can appear at any time via
  // Mapping Admin or an earlier Review Queue session, so this is computed fresh on every load.
  const groups: Group[] = await Promise.all(
    Array.from(buckets.entries()).map(async ([key, bucket]) => {
      let representativeDescription = key;
      let bestCount = -1;
      for (const [variant, count] of bucket.variantCounts) {
        if (count > bestCount) {
          bestCount = count;
          representativeDescription = variant;
        }
      }

      const match = await matchCategoryRule(representativeDescription);

      return {
        key,
        representativeDescription,
        count: bucket.count,
        totalAmount: bucket.totalAmount,
        earliest: bucket.earliest,
        latest: bucket.latest,
        suggestionReason: bucket.suggestionReason,
        currencies: Array.from(bucket.currencies),
        suggestion: match
          ? {
              categoryId: match.category.id,
              categoryName: match.category.name,
              ruleSummary: `${match.rule.matchType} · "${match.rule.pattern}"`,
            }
          : null,
      };
    })
  );

  // Sort by count descending: a group of 86 identical rows is one decision that clears 86
  // transactions at once, so surfacing the biggest recurring gaps first shrinks the queue
  // fastest. Ties broken by total absolute amount, so bigger-dollar gaps still float up.
  groups.sort((a, b) => b.count - a.count || Math.abs(b.totalAmount) - Math.abs(a.totalAmount));

  return (
    <div>
      <PageHeader
        title="Review Queue"
        subtitle={
          needsReview.length > 0
            ? `${needsReview.length} transaction${needsReview.length === 1 ? "" : "s"} across ${groups.length} description group${
                groups.length === 1 ? "" : "s"
              } need a category.`
            : undefined
        }
      />

      {groups.length === 0 ? (
        <EmptyState>You&rsquo;re all caught up — no transactions need review.</EmptyState>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.key}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-medium text-slate-900">{g.representativeDescription}</h3>
                    <Badge tone="amber">
                      {g.count} transaction{g.count === 1 ? "" : "s"}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    {formatDate(g.earliest)} – {formatDate(g.latest)} · Total{" "}
                    {g.currencies.length === 1 && g.currencies[0] !== "INR" ? (
                      <>
                        {g.currencies[0]} {Math.abs(g.totalAmount).toFixed(2)}{" "}
                        <span className="align-middle">
                          <Badge tone="amber">FX — not yet in INR</Badge>
                        </span>
                      </>
                    ) : (
                      formatINR(g.totalAmount)
                    )}
                  </div>
                  {g.suggestionReason && (
                    <p className="mt-2 text-xs italic text-slate-500">Why flagged: {g.suggestionReason}</p>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <ReviewGroupActions groupKey={g.key} suggestion={g.suggestion} categories={categoryOptions} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
