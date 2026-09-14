"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Badge } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import CategoryPicker from "./CategoryPicker";
import { updateTransactionCategory, bulkUpdateCategory } from "./actions";
import type { CategoryOption, LedgerRow } from "./types";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  gmail_daily: "Gmail (daily)",
  gmail_monthly_reconcile: "Gmail (reconcile)",
  csv_import: "CSV import",
  migration: "Migrated",
};

export default function LedgerTable({
  rows,
  categories,
}: {
  rows: LedgerRow[];
  categories: CategoryOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [optimisticCategory, setOptimisticCategory] = useState<Record<string, string>>({});

  const categoryById = useMemo(() => {
    const m = new Map<string, CategoryOption>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  const allVisibleSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll() {
    setSelected((prev) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(prev);
      for (const r of rows) next.add(r.id);
      return next;
    });
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleRowCategorySelect(txnId: string, categoryId: string) {
    setOptimisticCategory((prev) => ({ ...prev, [txnId]: categoryId }));
    setEditingRowId(null);
    startTransition(async () => {
      await updateTransactionCategory(txnId, categoryId);
    });
  }

  function handleBulkCategorySelect(categoryId: string) {
    const ids = Array.from(selected);
    setOptimisticCategory((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = categoryId;
      return next;
    });
    setBulkPickerOpen(false);
    startTransition(async () => {
      await bulkUpdateCategory(ids, categoryId);
      setSelected(new Set());
    });
  }

  return (
    <div>
      {selected.size > 0 && (
        <div className="mb-3 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5">
          <span className="text-sm font-medium text-blue-900">{selected.size} selected</span>
          <div className="relative">
            <button
              type="button"
              onClick={() => setBulkPickerOpen((v) => !v)}
              disabled={isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Categorize {selected.size} selected…
            </button>
            {bulkPickerOpen && (
              <CategoryPicker
                categories={categories}
                onSelect={handleBulkCategorySelect}
                onClose={() => setBulkPickerOpen(false)}
                disabled={isPending}
              />
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs font-medium text-blue-700 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[900px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="w-10 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                  aria-label="Select all visible rows"
                />
              </th>
              <th className="whitespace-nowrap px-3 py-2.5">Date</th>
              <th className="px-3 py-2.5">Description</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right">Amount</th>
              <th className="whitespace-nowrap px-3 py-2.5">Account</th>
              <th className="px-3 py-2.5">Category</th>
              <th className="whitespace-nowrap px-3 py-2.5">Status</th>
              <th className="whitespace-nowrap px-3 py-2.5">Source</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-sm text-slate-500">
                  No transactions match these filters.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const effectiveCategoryId = optimisticCategory[row.id] ?? row.categoryId ?? null;
              const effectiveCategory = effectiveCategoryId ? categoryById.get(effectiveCategoryId) : undefined;
              const categoryLabel = effectiveCategory?.name ?? row.categoryName ?? null;
              const isNegative = row.amount < 0;
              return (
                <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                  <td className="px-3 py-2 align-top">
                    <input
                      type="checkbox"
                      checked={selected.has(row.id)}
                      onChange={() => toggleOne(row.id)}
                      aria-label={`Select transaction ${row.rawDescription}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-slate-600">{formatDate(row.txnDate)}</td>
                  <td className="max-w-xs px-3 py-2 align-top text-slate-800">
                    <div className="truncate" title={row.rawDescription}>
                      {row.rawDescription}
                    </div>
                  </td>
                  <td
                    className={clsx(
                      "whitespace-nowrap px-3 py-2 text-right align-top font-medium tabular-nums",
                      isNegative ? "text-rose-600" : "text-emerald-600"
                    )}
                  >
                    {row.currency !== "INR" ? (
                      <span title="Native currency — not yet converted to INR">
                        {row.currency} {Math.abs(row.amount).toFixed(2)}
                        <span className="ml-1 align-middle">
                          <Badge tone="amber">FX</Badge>
                        </span>
                      </span>
                    ) : (
                      formatINR(row.amount, { signDisplay: "always" })
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top text-slate-600">
                    {row.accountName ? (
                      <span>
                        {row.accountName}
                        {row.accountHolder && (
                          <span className="ml-1 text-xs text-slate-400">({row.accountHolder})</span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="relative px-3 py-2 align-top">
                    <button
                      type="button"
                      onClick={() => setEditingRowId(editingRowId === row.id ? null : row.id)}
                      className={clsx(
                        "rounded-md border px-2 py-1 text-left text-xs font-medium hover:border-slate-300",
                        categoryLabel
                          ? "border-slate-200 bg-slate-50 text-slate-700"
                          : "border-dashed border-amber-300 bg-amber-50 text-amber-700"
                      )}
                    >
                      {categoryLabel ?? "Uncategorized — click to set"}
                    </button>
                    {editingRowId === row.id && (
                      <CategoryPicker
                        categories={categories}
                        currentCategoryId={effectiveCategoryId}
                        onSelect={(categoryId) => handleRowCategorySelect(row.id, categoryId)}
                        onClose={() => setEditingRowId(null)}
                        disabled={isPending}
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    <Badge tone={row.status === "needs_review" ? "amber" : "emerald"}>
                      {row.status === "needs_review" ? "Needs review" : "Categorized"}
                    </Badge>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">
                    <Badge tone="slate">{SOURCE_LABEL[row.source] ?? row.source}</Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
