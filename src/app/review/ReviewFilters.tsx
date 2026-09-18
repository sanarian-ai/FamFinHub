"use client";

import { useRouter, useSearchParams } from "next/navigation";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Year/month filter for the Review Queue — narrows which needs_review transactions are grouped
 * and shown, the same "filter the rows, then re-derive everything" pattern as Insights/Ledger.
 * `years` only lists years that actually have an outstanding (non-dismissed) needs_review row,
 * so there's never a selectable year with nothing behind it.
 */
export function ReviewFilters({
  years,
  selectedYear,
  selectedMonth,
}: {
  years: number[];
  selectedYear: number | undefined;
  selectedMonth: number | undefined;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function update(key: "year" | "month", value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`/review?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Filter by year"
        value={selectedYear ?? ""}
        onChange={(e) => update("year", e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
      >
        <option value="">All years</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by month"
        value={selectedMonth ?? ""}
        onChange={(e) => update("month", e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:border-slate-400 focus:outline-none"
      >
        <option value="">All months</option>
        {MONTH_NAMES.map((name, i) => (
          <option key={name} value={i + 1}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
