"use client";

import { formatINR } from "@/lib/format";
import { ACCOUNT_TYPE_COLORS } from "./colors";
import type { AccountTypeTotal } from "./aggregate";

export function AccountTypeBars({
  data,
  total,
  divisor = 1,
}: {
  data: AccountTypeTotal[];
  total: number;
  /** When > 1, displayed amounts show total/divisor (labeled "/mo") instead of the raw total.
   * `pct` and segment width stay derived from the true (undivided) totals — identical either way. */
  divisor?: number;
}) {
  if (data.length === 0 || total === 0) {
    return <div className="flex h-56 items-center justify-center text-sm text-slate-400">No categorized activity this period.</div>;
  }
  return (
    <div className="flex h-56 flex-col justify-center gap-4">
      <div className="flex h-4 w-full overflow-hidden rounded-full bg-slate-100">
        {data.map((d) => {
          const pct = total > 0 ? (d.total / total) * 100 : 0;
          if (pct <= 0) return null;
          return (
            <div
              key={d.type}
              style={{ width: `${pct}%`, background: ACCOUNT_TYPE_COLORS[d.type] }}
              title={`${d.type}: ${formatINR(d.total / divisor)}${divisor > 1 ? "/mo" : ""} (${pct.toFixed(0)}%)`}
            />
          );
        })}
      </div>
      <ul className="space-y-2">
        {data.map((d) => (
          <li key={d.type} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm">
            <span className="flex items-center gap-2 text-slate-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ACCOUNT_TYPE_COLORS[d.type] }} aria-hidden />
              {d.type}
            </span>
            <span className="shrink-0 whitespace-nowrap font-medium text-slate-900">
              {formatINR(d.total / divisor)}
              {divisor > 1 && <span className="text-slate-400">/mo</span>}
              <span className="ml-1.5 text-xs font-normal text-slate-400">{((d.total / total) * 100).toFixed(0)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
