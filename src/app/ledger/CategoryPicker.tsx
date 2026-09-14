"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import clsx from "clsx";
import type { CategoryOption } from "./types";

/**
 * Searchable category dropdown, grouped by Nature › ExpenseType.
 * Deliberately does NOT allow free-typing a brand-new category — if nothing
 * matches, it just hints that new categories are added via Mapping Admin.
 * Used both for single-row inline edit and for the bulk "categorize N
 * selected" action.
 */
export default function CategoryPicker({
  categories,
  currentCategoryId,
  onSelect,
  onClose,
  disabled,
}: {
  categories: CategoryOption[];
  currentCategoryId?: string | null;
  onSelect: (categoryId: string) => void;
  onClose: () => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.expenseTypeName.toLowerCase().includes(q) ||
        c.natureName.toLowerCase().includes(q)
    );
  }, [categories, query]);

  // Group consecutive rows by Nature › ExpenseType — categories is already
  // sorted that way, so this just needs to detect group boundaries.
  const groups: { label: string; items: CategoryOption[] }[] = [];
  for (const c of filtered) {
    const label = `${c.natureName} › ${c.expenseTypeName}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(c);
    } else {
      groups.push({ label, items: [c] });
    }
  }

  return (
    <div
      ref={rootRef}
      className="absolute left-0 top-full z-30 mt-1 w-80 max-w-[90vw] rounded-lg border border-slate-200 bg-white shadow-lg"
    >
      <div className="border-b border-slate-100 p-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search categories…"
          className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm outline-none focus:border-slate-400"
        />
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {groups.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-slate-500">
            No matching category — add new categories from{" "}
            <span className="font-medium text-slate-700">Mapping Admin</span>.
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="sticky top-0 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {g.label}
            </div>
            {g.items.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(c.id)}
                className={clsx(
                  "flex w-full items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-slate-100 disabled:opacity-50",
                  c.id === currentCategoryId && "bg-blue-50 font-medium text-blue-700"
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
