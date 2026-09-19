"use client";

import Link from "next/link";
import { formatINR } from "@/lib/format";
import type { RankedCategoryTotals } from "./aggregate";

function isoDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Ranked top-N category list for a single month, single accent color (category is a long,
 * unbounded tail — see aggregate.ts's sumByCategoryRanked — so unlike Nature/Account Type this
 * doesn't try to give every category its own hue; bar length carries the magnitude instead).
 * `accent` ties this list visually to whichever flow it's showing (Expense=red, Income=aqua,
 * see colors.ts FLOW_COLORS) so it reads as part of the trend chart above it.
 */
export function CategoryBars({
  data,
  total,
  accent,
  rangeStart,
  rangeEnd,
}: {
  data: RankedCategoryTotals;
  total: number;
  accent: string;
  rangeStart: Date;
  rangeEnd: Date;
}) {
  if (data.items.length === 0 || total === 0) {
    return <div className="flex h-56 items-center justify-center text-sm text-slate-400">Nothing categorized this month yet.</div>;
  }
  const from = isoDateUTC(rangeStart);
  // rangeEnd is exclusive (the start of the next month) — Ledger's "to" filter is inclusive,
  // so step back one day to keep the link scoped to exactly this month.
  const to = isoDateUTC(new Date(rangeEnd.getTime() - 24 * 60 * 60 * 1000));

  return (
    <ul className="space-y-1.5">
      {data.items.map((c) => {
        const pct = total > 0 ? (c.total / total) * 100 : 0;
        return (
          <li key={c.id}>
            <Link
              href={`/ledger?categoryId=${c.id}&from=${from}&to=${to}`}
              className="block rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
              title="View these transactions in the Ledger"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-slate-700">{c.name}</span>
                <span className="shrink-0 whitespace-nowrap font-medium text-slate-900">
                  {formatINR(c.total)}
                  <span className="ml-1.5 text-xs font-normal text-slate-400">{pct.toFixed(0)}%</span>
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: accent }} />
              </div>
            </Link>
          </li>
        );
      })}
      {data.otherCount > 0 && (
        <li className="flex items-center justify-between gap-2 px-2 pt-1 text-xs text-slate-400">
          <span>
            +{data.otherCount} more categor{data.otherCount === 1 ? "y" : "ies"}
          </span>
          <span>{formatINR(data.otherTotal)}</span>
        </li>
      )}
    </ul>
  );
}
