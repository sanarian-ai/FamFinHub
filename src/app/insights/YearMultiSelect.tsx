"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { YEARS_COOKIE_NAME, encodeYearsCookie } from "./yearsCookie";

/**
 * The global "which years to consider" filter for Insights & Trends — sits at the top of the
 * page (the "uber" control) and scopes every view below it (YoY, trend explorer, seasonality,
 * account breakdown, anomalies, CSV export). Backed by a `years` query param: a comma-separated
 * list of yearBucket sortKeys, or absent for "all years selected". `selectedKeys` is passed down
 * from the server (page.tsx), which already resolved URL → persisted cookie → default — this
 * component never re-derives selection state from searchParams itself, so its display can never
 * drift from what's actually been filtered server-side.
 */
export function YearMultiSelect({
  options,
  selectedKeys,
}: {
  options: { sortKey: number; label: string }[];
  selectedKeys: number[] | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = selectedKeys == null ? null : new Set(selectedKeys); // null = all
  const allSelected = selected == null;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function applyKeys(keys: number[] | null) {
    // Persist first — so a fresh visit (no `years` in the URL) still opens on this choice.
    document.cookie = `${YEARS_COOKIE_NAME}=${encodeYearsCookie(keys, options.length)}; path=/; max-age=31536000; samesite=lax`;
    const params = new URLSearchParams(searchParams.toString());
    if (keys == null || keys.length === options.length) {
      params.delete("years"); // "everything selected" collapses back to the "all years" state
    } else {
      params.set("years", keys.sort((a, b) => a - b).join(","));
    }
    router.push(`/insights?${params.toString()}`);
  }

  function toggle(sortKey: number) {
    const current = new Set(selected ?? options.map((o) => o.sortKey));
    if (current.has(sortKey)) current.delete(sortKey);
    else current.add(sortKey);
    applyKeys([...current]);
  }

  const summary = allSelected
    ? "All years"
    : selected!.size === 1
    ? options.find((o) => selected!.has(o.sortKey))?.label ?? "1 year"
    : `${selected!.size} years selected`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <span aria-hidden>📅</span>
        {summary}
        <span aria-hidden className="text-slate-400">▾</span>
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable
          className="absolute right-0 z-20 mt-1 max-h-80 w-48 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg"
        >
          <div className="mb-1 flex items-center justify-between gap-2 border-b border-slate-100 px-1 pb-2 text-xs">
            <button type="button" className="font-medium text-slate-600 hover:text-slate-900" onClick={() => applyKeys(null)}>
              Select all
            </button>
            <button
              type="button"
              className="font-medium text-slate-600 hover:text-slate-900"
              onClick={() => applyKeys(options.length ? [options[options.length - 1].sortKey] : [])}
            >
              Latest year only
            </button>
          </div>
          {options.map((o) => {
            const checked = allSelected || selected!.has(o.sortKey);
            return (
              <label
                key={o.sortKey}
                className={clsx(
                  "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50",
                  checked ? "text-slate-900" : "text-slate-500",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.sortKey)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                {o.label}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
