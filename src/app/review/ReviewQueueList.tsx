"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Badge, Card } from "@/components/ui";
import { formatINR, formatDate } from "@/lib/format";
import { ReviewGroupActions, type CategoryOption, type LiveSuggestion } from "./ReviewGroupActions";
import { bulkCategorizeWithOptionalRuleAction } from "./actions";

export type Group = {
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

export type AmountBucket = { id: string; label: string; min: number; max: number };

// Cutoffs picked from the real needs_review distribution (2026-09-19): the bulk of the queue is
// small day-to-day spend (₹0–5,000, ~90% of rows), then a near-empty ₹5k–1L band, then a real
// fat tail of five/six/seven-figure transfers — mutual-fund RTGS, FX remittances, property NEFTs
// — that matter far more to the household's financial picture than volume of small rows does.
// Buckets on each group's LARGEST individual transaction (`maxAbsAmount`), not its summed total,
// so a group of many small recurring charges never gets misclassified as "high-value."
export const AMOUNT_BUCKETS: AmountBucket[] = [
  { id: "under-1k", label: "Under ₹1,000", min: 0, max: 1000 },
  { id: "1k-5k", label: "₹1,000 – 5,000", min: 1000, max: 5000 },
  { id: "5k-1l", label: "₹5,000 – 1,00,000", min: 5000, max: 100000 },
  { id: "1l-plus", label: "₹1,00,000+", min: 100000, max: Infinity },
];

export type KeywordChip = { token: string; count: number };

const CONTEXT_WINDOW_DAYS = 5;
const MIN_RULE_PATTERN_LENGTH = 3;

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDaysUTC(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
function ledgerLinkForGroup(representativeDescription: string): string {
  const params = new URLSearchParams();
  params.set("q", representativeDescription);
  params.set("status", "needs_review");
  return `/ledger?${params.toString()}`;
}
function ledgerContextLink(earliest: Date, latest: Date): string {
  const params = new URLSearchParams();
  params.set("from", isoDateUTC(addDaysUTC(earliest, -CONTEXT_WINDOW_DAYS)));
  params.set("to", isoDateUTC(addDaysUTC(latest, CONTEXT_WINDOW_DAYS)));
  return `/ledger?${params.toString()}`;
}

/**
 * Wraps the Review Queue's group cards in a keyword search + multi-select bulk bar.
 *
 * Search is a plain "contains" filter over each group's representative description,
 * client-side (the queue is a few hundred rows at most — no need for a server round trip
 * per keystroke). Filtering narrows which groups are selectable; "Select all N filtered"
 * plus the existing per-group checkboxes both feed the same bulk-categorize action. When a
 * search term is active, the bulk bar also offers creating a standing `contains` CategoryRule
 * from that term, so future imports with the same keyword (e.g. every "RAZ*Swiggy" /
 * "SWIGGY INSTAMART" processor-prefix variant) skip the queue entirely going forward.
 */
export function ReviewQueueList({
  groups,
  categories,
  keywordChips,
}: {
  groups: Group[];
  categories: CategoryOption[];
  keywordChips: KeywordChip[];
}) {
  const [search, setSearch] = useState("");
  const [amountBucket, setAmountBucket] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [createRule, setCreateRule] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const searchTerm = search.trim().toLowerCase();
  const activeBucket = AMOUNT_BUCKETS.find((b) => b.id === amountBucket) ?? null;
  const filteredGroups = useMemo(() => {
    let result = groups;
    if (searchTerm) {
      result = result.filter((g) => g.representativeDescription.toLowerCase().includes(searchTerm));
    }
    if (activeBucket) {
      result = result.filter((g) => g.maxAbsAmount >= activeBucket.min && g.maxAbsAmount < activeBucket.max);
      // Default queue order is "biggest recurring pattern first" (count desc) — the right lens
      // for clearing bulk noise. Once amount-filtered, the point is reviewing the biggest-ticket
      // items first, so re-sort by the group's largest transaction, descending.
      result = [...result].sort((a, b) => b.maxAbsAmount - a.maxAbsAmount);
    }
    return result;
  }, [groups, searchTerm, activeBucket]);
  const filteredTxnCount = filteredGroups.reduce((s, g) => s + g.count, 0);
  const bucketCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const b of AMOUNT_BUCKETS) {
      counts.set(b.id, groups.filter((g) => g.maxAbsAmount >= b.min && g.maxAbsAmount < b.max).length);
    }
    return counts;
  }, [groups]);
  const isFiltered = !!searchTerm || !!activeBucket;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllFiltered() {
    setSelected(new Set(filteredGroups.map((g) => g.key)));
  }

  const categoryFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? categories.filter((c) => c.name.toLowerCase().includes(q) || c.expenseType.toLowerCase().includes(q)) : categories;
    return pool.slice(0, 40);
  }, [query, categories]);

  const selectedCount = selected.size;
  const selectedTxnCount = groups.filter((g) => selected.has(g.key)).reduce((s, g) => s + g.count, 0);
  const canCreateRule = searchTerm.length >= MIN_RULE_PATTERN_LENGTH;

  function applyCategory(categoryId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await bulkCategorizeWithOptionalRuleAction(
          Array.from(selected),
          categoryId,
          createRule && canCreateRule ? searchTerm : undefined
        );
        setSelected(new Set());
        setPickerOpen(false);
        setQuery("");
        setCreateRule(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search descriptions (contains)… e.g. swiggy"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        {keywordChips.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {keywordChips.map((c) => (
              <button
                key={c.token}
                type="button"
                onClick={() => setSearch((prev) => (prev.trim().toLowerCase() === c.token ? "" : c.token))}
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  searchTerm === c.token
                    ? "border-indigo-300 bg-indigo-100 text-indigo-800"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                )}
              >
                {c.token} ({c.count})
              </button>
            ))}
          </div>
        )}
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
            Filter by amount &mdash; largest transaction in each group
          </p>
          <div className="flex flex-wrap gap-1.5">
            {AMOUNT_BUCKETS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setAmountBucket((prev) => (prev === b.id ? null : b.id))}
                className={clsx(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  amountBucket === b.id
                    ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                    : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                )}
              >
                {b.label} ({bucketCounts.get(b.id) ?? 0})
              </button>
            ))}
          </div>
        </div>
        {isFiltered && (
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-sm">
            <span className="text-slate-600">
              {filteredGroups.length} group{filteredGroups.length === 1 ? "" : "s"} · {filteredTxnCount} transaction
              {filteredTxnCount === 1 ? "" : "s"}
              {searchTerm && (
                <>
                  {" "}
                  match &ldquo;{searchTerm}&rdquo;
                </>
              )}
              {activeBucket && (
                <>
                  {searchTerm ? " and are" : " match"} {activeBucket.label}
                  , sorted by amount
                </>
              )}
            </span>
            {filteredGroups.length > 0 && (
              <button type="button" onClick={selectAllFiltered} className="font-medium text-indigo-600 hover:underline">
                Select all {filteredGroups.length}
              </button>
            )}
          </div>
        )}
      </Card>

      {selectedCount > 0 && (
        <Card className="sticky top-2 z-10 border-indigo-200 bg-indigo-50">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-indigo-900">
              {selectedCount} group{selectedCount === 1 ? "" : "s"} selected ({selectedTxnCount} transaction{selectedTxnCount === 1 ? "" : "s"})
            </span>
            {!pickerOpen ? (
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
              >
                Categorize selected…
              </button>
            ) : (
              <div className="w-full rounded-lg border border-indigo-200 bg-white p-3">
                {canCreateRule && (
                  <label className="mb-2 flex items-start gap-2 rounded-md bg-indigo-50 px-2.5 py-2 text-xs text-indigo-900">
                    <input
                      type="checkbox"
                      checked={createRule}
                      onChange={(e) => setCreateRule(e.target.checked)}
                      className="mt-0.5 h-3.5 w-3.5 rounded border-indigo-300"
                    />
                    <span>
                      Also always map descriptions containing <span className="font-semibold">&ldquo;{searchTerm}&rdquo;</span> to
                      this category — future imports with this keyword will skip the Review Queue.
                    </span>
                  </label>
                )}
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search categories…"
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-200">
                  {categoryFiltered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={isPending}
                      onClick={() => applyCategory(c.id)}
                      className="flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      <span className="text-slate-800">{c.name}</span>
                      <span className="text-xs text-slate-400">{c.expenseType}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setSelected(new Set());
                setCreateRule(false);
              }}
              className="text-xs text-indigo-700 hover:underline"
            >
              Clear selection
            </button>
          </div>
          {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        </Card>
      )}

      {filteredGroups.length === 0 && isFiltered ? (
        <Card>
          <p className="text-sm text-slate-500">
            No pending groups match{searchTerm ? <> &ldquo;{searchTerm}&rdquo;</> : null}
            {activeBucket ? <> {searchTerm ? "and " : ""}{activeBucket.label}</> : null}.
          </p>
        </Card>
      ) : (
        filteredGroups.map((g) => (
          <Card key={g.key}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(g.key)}
                  onChange={() => toggle(g.key)}
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300"
                  aria-label={`Select ${g.representativeDescription}`}
                />
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
                  {g.suggestionReason && <p className="mt-2 text-xs italic text-slate-500">Why flagged: {g.suggestionReason}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs">
                    <Link href={ledgerLinkForGroup(g.representativeDescription)} target="_blank" className="font-medium text-sky-600 hover:text-sky-800 hover:underline">
                      View transaction{g.count === 1 ? "" : "s"} in Ledger &rarr;
                    </Link>
                    <Link href={ledgerContextLink(g.earliest, g.latest)} target="_blank" className="font-medium text-slate-500 hover:text-slate-700 hover:underline">
                      View nearby dates (&plusmn;{CONTEXT_WINDOW_DAYS}d) &rarr;
                    </Link>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-4">
              <ReviewGroupActions
                groupKey={g.key}
                representativeDescription={g.representativeDescription}
                count={g.count}
                suggestion={g.suggestion}
                categories={categories}
              />
            </div>
          </Card>
        ))
      )}
    </div>
  );
}
