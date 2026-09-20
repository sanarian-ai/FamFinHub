"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Badge } from "@/components/ui";
import { formatDate, formatMonth, formatINR } from "@/lib/format";
import CategoryPicker from "./CategoryPicker";
import { updateTransactionCategory, bulkUpdateCategory, updateTransactionEffectiveMonth } from "./actions";
import type { CategoryOption, LedgerRow } from "./types";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  gmail_daily: "Gmail (daily)",
  gmail_monthly_reconcile: "Gmail (reconcile)",
  csv_import: "CSV import",
  migration: "Migrated",
};

/**
 * One header cell that's also a sort link. First click on a column sorts by `defaultDir`
 * (most recent/largest first for date/amount-ish columns, alphabetical for text columns);
 * clicking the already-active column flips direction. Server-side sort (a `sort`/`dir` query
 * param handled in page.tsx's Prisma orderBy) rather than client-side re-sort, since this table
 * only ever holds one page (75 rows) of a much larger filtered set — sorting just the visible
 * page would silently misrepresent the data.
 */
function SortableHeader({
  label,
  column,
  defaultDir,
  currentSort,
  currentDir,
  filterQueryString,
  align,
}: {
  label: string;
  column: string;
  defaultDir: "asc" | "desc";
  currentSort: string;
  currentDir: "asc" | "desc";
  filterQueryString: string;
  align?: "right";
}) {
  const isActive = currentSort === column;
  const nextDir: "asc" | "desc" = isActive ? (currentDir === "asc" ? "desc" : "asc") : defaultDir;
  const params = new URLSearchParams(filterQueryString);
  params.set("sort", column);
  params.set("dir", nextDir);
  const href = `/ledger?${params.toString()}`;
  return (
    <th className={clsx("whitespace-nowrap px-3 py-2.5", align === "right" && "text-right")}>
      <a href={href} className={clsx("inline-flex items-center gap-1 hover:text-slate-800", align === "right" && "flex-row-reverse")}>
        {label}
        {isActive && <span className="text-slate-400">{currentDir === "asc" ? "▲" : "▼"}</span>}
      </a>
    </th>
  );
}

export default function LedgerTable({
  rows,
  categories,
  filterQueryString,
  sort,
  dir,
}: {
  rows: LedgerRow[];
  categories: CategoryOption[];
  /** Current filters (from/to/accountId/categoryId/natureId/accountType/status/q/
   * includeHistorical), pre-serialized — NOT including `page` or the current sort — so each
   * header link can start clean and set its own sort/dir. */
  filterQueryString: string;
  sort: string;
  dir: "asc" | "desc";
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingMonthRowId, setEditingMonthRowId] = useState<string | null>(null);
  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [optimisticCategory, setOptimisticCategory] = useState<Record<string, string>>({});
  // undefined = "no optimistic value yet, use row.effectiveMonth"; null = "cleared"; string = new override
  const [optimisticEffectiveMonth, setOptimisticEffectiveMonth] = useState<Record<string, string | null>>({});

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

  function handleEffectiveMonthChange(txnId: string, month: string | null) {
    const iso = month ? `${month}-01T00:00:00.000Z` : null;
    setOptimisticEffectiveMonth((prev) => ({ ...prev, [txnId]: iso }));
    setEditingMonthRowId(null);
    startTransition(async () => {
      await updateTransactionEffectiveMonth(txnId, month);
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
              <SortableHeader label="Date" column="date" defaultDir="desc" currentSort={sort} currentDir={dir} filterQueryString={filterQueryString} />
              <SortableHeader label="Counts toward" column="effectiveMonth" defaultDir="desc" currentSort={sort} currentDir={dir} filterQueryString={filterQueryString} />
              <SortableHeader label="Description" column="description" defaultDir="asc" currentSort={sort} currentDir={dir} filterQueryString={filterQueryString} />
              <SortableHeader label="Amount" column="amount" defaultDir="desc" currentSort={sort} currentDir={dir} filterQueryString={filterQueryString} align="right" />
              <SortableHeader label="Account" column="account" defaultDir="asc" currentSort={sort} currentDir={dir} filterQueryString={filterQueryString} />
              <SortableHeader label="Category" column="category" defaultDir="asc" currentSort={sort} currentDir={dir} filterQueryString={filterQueryString} />
              <SortableHeader label="Status" column="status" defaultDir="asc" currentSort={sort} currentDir={dir} filterQueryString={filterQueryString} />
              <SortableHeader label="Source" column="source" defaultDir="asc" currentSort={sort} currentDir={dir} filterQueryString={filterQueryString} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center text-sm text-slate-500">
                  No transactions match these filters.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const effectiveCategoryId = optimisticCategory[row.id] ?? row.categoryId ?? null;
              const effectiveCategory = effectiveCategoryId ? categoryById.get(effectiveCategoryId) : undefined;
              const categoryLabel = effectiveCategory?.name ?? row.categoryName ?? null;
              const isNegative = row.amount < 0;
              const effectiveMonthIso = row.id in optimisticEffectiveMonth ? optimisticEffectiveMonth[row.id] : row.effectiveMonth;
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
                  <td className="relative whitespace-nowrap px-3 py-2 align-top">
                    {editingMonthRowId === row.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="month"
                          autoFocus
                          defaultValue={effectiveMonthIso ? effectiveMonthIso.slice(0, 7) : undefined}
                          onChange={(e) => handleEffectiveMonthChange(row.id, e.target.value || null)}
                          onBlur={() => setEditingMonthRowId(null)}
                          className="rounded-md border border-slate-200 px-1.5 py-1 text-xs"
                          disabled={isPending}
                        />
                      </div>
                    ) : effectiveMonthIso ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700">
                        <button
                          type="button"
                          onClick={() => setEditingMonthRowId(row.id)}
                          title="Real transaction date is unchanged — click to change this override"
                        >
                          → {formatMonth(effectiveMonthIso)}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEffectiveMonthChange(row.id, null)}
                          className="text-indigo-400 hover:text-indigo-700"
                          aria-label="Clear month override"
                          title="Clear override — revert to the real transaction date"
                        >
                          ✕
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingMonthRowId(row.id)}
                        className="text-xs text-slate-300 hover:text-slate-500"
                        title="Map this transaction to a different month for Dashboard/Insights reporting"
                      >
                        remap…
                      </button>
                    )}
                  </td>
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
