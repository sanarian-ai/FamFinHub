import { prisma } from "@/lib/prisma";
import {
  fetchActiveCategoryRules,
  matchCategoryRuleFromList,
  normalizeDescriptionKey,
} from "@/lib/categorize";
import { PageHeader, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import type { CategoryOption, LiveSuggestion } from "./ReviewGroupActions";
import { ReviewQueueList, type KeywordChip } from "./ReviewQueueList";
import { ReviewFilters } from "./ReviewFilters";
import { RestoreDismissalButton } from "./RestoreDismissalButton";

// The queue changes every time an action runs (revalidatePath handles that), but it's also
// an operational screen someone lands on repeatedly through the day — never serve a stale cache.
export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

type Group = {
  key: string;
  representativeDescription: string;
  count: number;
  totalAmount: number;
  maxAbsAmount: number;
  earliest: Date;
  latest: Date;
  suggestionReason: string | null;
  suggestion: LiveSuggestion;
  currencies: string[];
};

// Stopwords + noise tokens that would otherwise dominate the chip list without helping anyone
// narrow down a group (bank boilerplate, generic transaction-type words, pure numbers/dates).
const KEYWORD_STOPWORDS = new Set([
  "the", "and", "for", "from", "with", "this", "that", "your", "you", "are", "was", "were",
  "txn", "trans", "transaction", "payment", "paid", "pay", "upi", "neft", "imps", "rtgs",
  "ref", "no", "id", "pvt", "ltd", "limited", "india", "inr", "rs", "to", "on", "at", "of",
  "in", "via", "dr", "cr", "debit", "credit", "card", "account", "acct", "bank", "date",
  "value", "avl", "bal", "balance", "info", "not", "available", "pos", "atm", "ecom",
  // Every UPI description embeds the REMITTER's bank name ("HDFC BANK", "AXIS BANK",
  // "State Bank", "INDUSIND B", "YES BANKL") — that's structural boilerplate about which
  // bank routed the money, not a signal about the merchant, so it would otherwise dominate
  // the chip list without helping anyone group transactions. Verified against production
  // data 2026-09-19: hdfc/axis/indusind/state/bankl/icici were 6 of the top 10 chips before
  // this filter, crowding out merchant tokens like "manipal"/"paytm".
  "hdfc", "icici", "axis", "indusind", "kotak", "idfc", "rbl", "hsbc", "citi", "canara",
  "federal", "karur", "karnataka", "punjab", "baroda", "boi", "pnb", "deutsche", "standard",
  "chartered", "dbs", "yes", "bandhan", "uco", "iob", "maharashtra", "vijaya", "dena",
  "corporation", "andhra", "allahabad", "syndicate", "oriental", "bob", "sbi", "bankl",
  "state", "national", "bankn",
]);

const MIN_KEYWORD_TOKEN_LENGTH = 4;
const MIN_KEYWORD_GROUP_COUNT = 2;
const MAX_KEYWORD_CHIPS = 10;

/**
 * Surfaces the most common meaningful words across the review queue's group descriptions as
 * clickable filter chips, so a user can jump straight to "swiggy" or "amazon" without typing.
 * Counts distinct GROUPS a token appears in (not raw transactions), so one huge recurring
 * group can't crowd out a token that's genuinely common across many different merchants.
 */
function extractKeywordChips(groups: Group[]): KeywordChip[] {
  const tokenGroupCounts = new Map<string, number>();
  for (const g of groups) {
    const tokens = new Set(
      g.representativeDescription
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= MIN_KEYWORD_TOKEN_LENGTH)
        .filter((t) => !/^\d+$/.test(t))
        .filter((t) => !KEYWORD_STOPWORDS.has(t)),
    );
    for (const t of tokens) {
      tokenGroupCounts.set(t, (tokenGroupCounts.get(t) ?? 0) + 1);
    }
  }
  return Array.from(tokenGroupCounts.entries())
    .filter(([, count]) => count >= MIN_KEYWORD_GROUP_COUNT)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, MAX_KEYWORD_CHIPS)
    .map(([token, count]) => ({ token, count }));
}

export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const yearParam =
    typeof params.year === "string" ? parseInt(params.year, 10) : undefined;
  const monthParam =
    typeof params.month === "string" ? parseInt(params.month, 10) : undefined;
  const selectedYear = Number.isFinite(yearParam) ? yearParam : undefined;
  const selectedMonth =
    Number.isFinite(monthParam) && monthParam! >= 1 && monthParam! <= 12
      ? monthParam
      : undefined;

  const [allNeedsReview, activeCategories, dismissals, categoryRules] =
    await Promise.all([
      prisma.transaction.findMany({
        where: { status: "needs_review" },
        orderBy: { txnDate: "asc" },
      }),
      prisma.category.findMany({
        where: { isActive: true },
        include: { expenseType: true },
        orderBy: { name: "asc" },
      }),
      prisma.reviewDismissal.findMany({ orderBy: { createdAt: "desc" } }),
      // Fetched once here, not per group below — see the note on matchCategoryRuleFromList().
      fetchActiveCategoryRules(),
    ]);

  const categoryOptions: CategoryOption[] = activeCategories.map((c) => ({
    id: c.id,
    name: c.name,
    expenseType: c.expenseType.name,
  }));

  // "Discard forever" rows never come back, present or future — filtered out before anything
  // else touches this list (year/month options, counts, grouping all follow from this).
  const dismissedKeys = new Set(dismissals.map((d) => d.descriptionKey));
  const activeRows = allNeedsReview.filter(
    (t) => !dismissedKeys.has(normalizeDescriptionKey(t.rawDescription)),
  );

  // Year options: only years that actually have an outstanding row, so the filter never offers
  // an empty choice. Computed from activeRows (pre-year/month-filter) so switching years doesn't
  // shrink the year list itself.
  const availableYears = Array.from(
    new Set(activeRows.map((t) => t.txnDate.getUTCFullYear())),
  ).sort((a, b) => a - b);

  const needsReview = activeRows.filter((t) => {
    if (selectedYear != null && t.txnDate.getUTCFullYear() !== selectedYear)
      return false;
    if (selectedMonth != null && t.txnDate.getUTCMonth() + 1 !== selectedMonth)
      return false;
    return true;
  });

  // Group by normalized description — this is the core idea of the screen: 86 near-identical
  // "local commute" rows should read as one decision, not 86 separate line items.
  const buckets = new Map<
    string,
    {
      variantCounts: Map<string, number>;
      count: number;
      totalAmount: number;
      maxAbsAmount: number;
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
        maxAbsAmount: 0,
        earliest: txn.txnDate,
        latest: txn.txnDate,
        suggestionReason: null,
        currencies: new Set(),
      };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    bucket.totalAmount += Number(txn.amount);
    bucket.maxAbsAmount = Math.max(bucket.maxAbsAmount, Math.abs(Number(txn.amount)));
    if (txn.txnDate < bucket.earliest) bucket.earliest = txn.txnDate;
    if (txn.txnDate > bucket.latest) bucket.latest = txn.txnDate;
    if (!bucket.suggestionReason && txn.suggestionReason)
      bucket.suggestionReason = txn.suggestionReason;
    bucket.variantCounts.set(
      txn.rawDescription,
      (bucket.variantCounts.get(txn.rawDescription) ?? 0) + 1,
    );
    bucket.currencies.add(txn.currency);
  }

  // Resolve a representative raw-description string per group (the most common exact variant)
  // and check live whether any CategoryRule now matches it — rules can appear at any time via
  // Mapping Admin or an earlier Review Queue session, so this is computed fresh on every load.
  const groups: Group[] = Array.from(buckets.entries()).map(([key, bucket]) => {
    let representativeDescription = key;
    let bestCount = -1;
    for (const [variant, count] of bucket.variantCounts) {
      if (count > bestCount) {
        bestCount = count;
        representativeDescription = variant;
      }
    }

    // In-memory match against the rule set fetched once above — no DB call per group.
    const match = matchCategoryRuleFromList(
      representativeDescription,
      categoryRules,
    );

    return {
      key,
      representativeDescription,
      count: bucket.count,
      totalAmount: bucket.totalAmount,
      maxAbsAmount: bucket.maxAbsAmount,
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
  });

  // Sort by count descending: a group of 86 identical rows is one decision that clears 86
  // transactions at once, so surfacing the biggest recurring gaps first shrinks the queue
  // fastest. Ties broken by total absolute amount, so bigger-dollar gaps still float up.
  groups.sort(
    (a, b) =>
      b.count - a.count || Math.abs(b.totalAmount) - Math.abs(a.totalAmount),
  );

  // Computed from the full (unfiltered-by-search) group list so the chip set stays stable as
  // the user types into the search box — chips are a starting point, not a moving target.
  const keywordChips = extractKeywordChips(groups);

  const filterActive = selectedYear != null || selectedMonth != null;

  return (
    <div>
      <PageHeader
        title="Review Queue"
        subtitle={
          activeRows.length > 0
            ? filterActive
              ? `${needsReview.length} of ${activeRows.length} transaction${activeRows.length === 1 ? "" : "s"} match this filter, across ${groups.length} description group${groups.length === 1 ? "" : "s"}.`
              : `${needsReview.length} transaction${needsReview.length === 1 ? "" : "s"} across ${groups.length} description group${
                  groups.length === 1 ? "" : "s"
                } need a category.`
            : undefined
        }
        actions={
          <ReviewFilters
            years={availableYears}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
          />
        }
      />

      {activeRows.length === 0 ? (
        <EmptyState>
          You&rsquo;re all caught up — no transactions need review.
        </EmptyState>
      ) : groups.length === 0 ? (
        <EmptyState>No transactions need review for this filter.</EmptyState>
      ) : (
        <ReviewQueueList groups={groups} categories={categoryOptions} keywordChips={keywordChips} />
      )}

      {dismissals.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer text-sm font-medium text-slate-500 hover:text-slate-700">
            Discarded forever ({dismissals.length})
          </summary>
          <div className="mt-3 space-y-2">
            {dismissals.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="break-words text-sm text-slate-700">
                    {d.sampleDescription}
                  </p>
                  <p className="text-xs text-slate-400">
                    Discarded {formatDate(d.createdAt)} · {d.dismissedCount}{" "}
                    transaction
                    {d.dismissedCount === 1 ? "" : "s"} at the time
                  </p>
                </div>
                <RestoreDismissalButton id={d.id} />
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
