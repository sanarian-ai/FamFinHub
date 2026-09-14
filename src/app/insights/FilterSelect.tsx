"use client";

import { useRouter, useSearchParams } from "next/navigation";

/**
 * A <select> that navigates by updating one query param on change, preserving the rest —
 * lets the whole Insights page stay server-rendered (all aggregation happens in Server
 * Components) while still giving the drill-down dropdowns instant, URL-addressable state.
 */
export function FilterSelect({
  paramName,
  value,
  groups,
  className,
  ariaLabel,
}: {
  paramName: string;
  value: string;
  groups: { label?: string; options: { value: string; label: string }[] }[];
  className?: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set(paramName, e.target.value);
        router.push(`/insights?${params.toString()}`);
      }}
      className={
        className ??
        "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
      }
    >
      {groups.map((g, i) =>
        g.label ? (
          <optgroup key={i} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ) : (
          g.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        ),
      )}
    </select>
  );
}
