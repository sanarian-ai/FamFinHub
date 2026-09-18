import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  fetchActiveCategoryRules,
  matchCategoryRuleFromList,
  normalizeDescriptionKey,
} from "@/lib/categorize";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { formatINR, formatDate } from "@/lib/format";
import {
  ReviewGroupActions,
  type CategoryOption,
  type LiveSuggestion,
} from "./ReviewGroupActions";
import { ReviewFilters } from "./ReviewFilters";
import { RestoreDismissalButton } from "./RestoreDismissalButton";

// The queue changes every time an action runs (revalidatePath handles that), but it's also
// an operational screen someone lands on repeatedly through the day — never serve a stale cache.
export const dynamic = "force-dynamic";

type SearchParams = { [key: string]: string | string[] | undefined };

// YYYY-MM-DD in UTC, matching how the Ledger page parses `from`/`to` (`${from}T00:00:00.000Z`).
function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDaysUTC(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

// Deep-link into the Ledger, pre-filtered to exactly this group's transactions, so a reviewer
// can see full account/date/amount detail (and bulk-recategorize right there) instead of
// deciding from the bare description string alone.
function ledgerLinkForGroup(representativeDescription: string): string {
  const params = new URLSearchParams();
  params.set("q", representativeDescription);
  params.set("status", "needs_review");
  return `/ledger?${params.toString()}`;
}

// Deep-link into the Ledger showing everything (any status) in a window around this group's
// dates — the "was this part of a trip / one-off event" context a bare description can't answer.
const CONTEXT_WINDOW_DAYS = 5;
function ledgerContextLink(earliest: Date, latest: Date): string {
  const params = new URLSearchParams();
  params.set("from", isoDateUTC(addDaysUTC(earliest, -CONTEXT_WINDOW_DAYS)));
  params.set("to", isoDateUTC(addDaysUTC(latest, CONTEXT_WINDOW_DAYS)));
  return `/ledger?${params.toString()}`;
}


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
        <div className="space-y-4">
          {groups.map((g) => (
            <Card key={g.key}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words font-medium text-slate-900">
                      {g.representativeDescription}
                    </h3>
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
                    <p className="mt-2 text-xs italic text-slate-500">
                      Why flagged: {g.suggestionReason}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link
                      href={ledgerLinkForGroup(g.representativeDescription)}
                      target="_blank"
                      className="font-medium text-sky-600 hover:text-sky-800 hover:underline"
                    >
                      View transaction{g.count === 1 ? "" : "s"} in Ledger &rarr;
                    </Link>
                    <Link
                      href={ledgerContextLink(g.earliest, g.latest)}
                      target="_blank"
                      className="font-medium text-slate-500 hover:text-slate-700 hover:underline"
                    >
                      View nearby dates (&plusmn;{CONTEXT_WINDOW_DAYS}d) &rarr;
                    </Link>
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-slate-100 pt-4">
                <ReviewGroupActions
                  groupKey={g.key}
                  representativeDescription={g.representativeDescription}
                  count={g.count}
                  suggestion={g.suggestion}
                  categories={categoryOptions}
                />
              </div>
            </Card>
          ))}
        </div>
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
