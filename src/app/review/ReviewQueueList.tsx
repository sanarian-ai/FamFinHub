"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import clsx from "clsx";
import { Badge, Card } from "@/components/ui";
import { formatINR, formatDate } from "@/lib/format";
import { ReviewGroupActions, type CategoryOption, type LiveSuggestion } from "./ReviewGroupActions";
import { bulkCategorizeGroupsAction } from "./actions";

export type Group = {
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

const CONTEXT_WINDOW_DAYS = 5;

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
 * Wraps the Review Queue's group cards in a multi-select bulk bar — select several
 * description-groups (checkbox per card) and categorize them all in one action, instead of
 * one group at a time. Per-group actions (accept suggestion, pick a category, discard
 * forever) are unchanged and still live in ReviewGroupActions below each card.
 */
export function ReviewQueueList({ groups, categories }: { groups: Group[]; categories: CategoryOption[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q ? categories.filter((c) => c.name.toLowerCase().includes(q) || c.expenseType.toLowerCase().includes(q)) : categories;
    return pool.slice(0, 40);
  }, [query, categories]);

  const selectedCount = selected.size;
  const selectedTxnCount = groups.filter((g) => selected.has(g.key)).reduce((s, g) => s + g.count, 0);

  function applyCategory(categoryId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await bulkCategorizeGroupsAction(Array.from(selected), categoryId);
        setSelected(new Set());
        setPickerOpen(false);
        setQuery("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
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
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search categories…"
                  className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
                <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-200">
                  {filtered.map((c) => (
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
            <button type="button" onClick={() => setSelected(new Set())} className="text-xs text-indigo-700 hover:underline">
              Clear selection
            </button>
          </div>
          {error && <p className="mt-2 text-xs font-medium text-rose-600">{error}</p>}
        </Card>
      )}

      {groups.map((g) => (
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
      ))}
    </div>
  );
}
