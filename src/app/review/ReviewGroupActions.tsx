"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import {
  acceptSuggestionAction,
  categorizeAndCreateRuleAction,
  categorizeGroupAction,
  discardGroupForeverAction,
} from "./actions";

export type CategoryOption = { id: string; name: string; expenseType: string };
export type LiveSuggestion = { categoryId: string; categoryName: string; ruleSummary: string } | null;

export function ReviewGroupActions({
  groupKey,
  representativeDescription,
  count,
  suggestion,
  categories,
}: {
  groupKey: string;
  representativeDescription: string;
  count: number;
  suggestion: LiveSuggestion;
  categories: CategoryOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CategoryOption | null>(null);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [discarded, setDiscarded] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = q
      ? categories.filter((c) => c.name.toLowerCase().includes(q) || c.expenseType.toLowerCase().includes(q))
      : categories;
    return pool.slice(0, 40);
  }, [query, categories]);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong — please try again.");
      }
    });
  }

  // Optimistic hide: the server action revalidates /review, but that group's own row is about
  // to disappear from the page entirely, so there's nothing left to show a "done" state on —
  // collapse this card's actions immediately rather than leaving stale buttons up during the
  // round trip.
  if (discarded) {
    return <p className="text-xs text-slate-400">Discarded — this won&rsquo;t be shown again.</p>;
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}

      {suggestion ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg bg-emerald-50 px-3 py-2">
          <span className="text-sm text-emerald-800">
            Rule match: <span className="font-semibold">{suggestion.categoryName}</span>{" "}
            <span className="text-emerald-600">({suggestion.ruleSummary})</span>
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => run(() => acceptSuggestionAction(groupKey))}
            className="ml-auto shrink-0 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {isPending ? "Applying…" : "Accept suggestion"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-slate-400">No category rule matches this description yet.</p>
      )}

      {!pickerOpen ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Pick a category…
          </button>

          {!discardConfirmOpen ? (
            <button
              type="button"
              onClick={() => setDiscardConfirmOpen(true)}
              className="text-xs text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-600"
            >
              Discard forever
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5">
              <span className="text-xs text-amber-800">
                Stop asking about &ldquo;{representativeDescription}&rdquo; ({count} transaction
                {count === 1 ? "" : "s"})? It won&rsquo;t affect its category or amount — just hides it from this queue,
                permanently. You can undo this later from the list at the bottom of the page.
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    await discardGroupForeverAction(groupKey, representativeDescription);
                    setDiscarded(true);
                  })
                }
                className="shrink-0 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
              >
                {isPending ? "Discarding…" : "Yes, discard forever"}
              </button>
              <button
                type="button"
                onClick={() => setDiscardConfirmOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3">
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder="Search categories…"
            className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
          <div className="mt-2 max-h-48 overflow-y-auto rounded-md border border-slate-200 bg-white">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-slate-400">No categories match &ldquo;{query}&rdquo;.</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c)}
                  className={clsx(
                    "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm transition hover:bg-slate-50",
                    selected?.id === c.id && "bg-indigo-50"
                  )}
                >
                  <span className="text-slate-800">{c.name}</span>
                  <span className="text-xs text-slate-400">{c.expenseType}</span>
                </button>
              ))
            )}
          </div>

          {selected && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
              <span className="text-xs text-slate-500">
                Selected: <span className="font-medium text-slate-800">{selected.name}</span>
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    await categorizeAndCreateRuleAction(groupKey, selected.id);
                    setPickerOpen(false);
                  })
                }
                className="ml-auto shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
              >
                {isPending ? "Saving…" : "Always categorize like this"}
              </button>
              <button
                type="button"
                disabled={isPending}
                onClick={() =>
                  run(async () => {
                    await categorizeGroupAction(groupKey, selected.id);
                    setPickerOpen(false);
                  })
                }
                className="shrink-0 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Just this batch
              </button>
              <button
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setSelected(null);
                  setQuery("");
                }}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
