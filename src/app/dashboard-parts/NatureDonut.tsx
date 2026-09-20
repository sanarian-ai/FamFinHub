"use client";

import Link from "next/link";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { natureColor } from "./colors";
import { formatINR } from "@/lib/format";
import type { NatureTotal } from "./aggregate";

function CustomTooltip({ active, payload, divisor = 1 }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <div className="flex items-center gap-1.5 font-semibold text-slate-900">
        <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.payload.fill }} />
        {p.name}
      </div>
      <div className="mt-0.5 text-slate-600">
        {formatINR(p.value / divisor)}
        {divisor > 1 && <span className="text-slate-400">/mo</span>}
      </div>
    </div>
  );
}

export function NatureDonut({
  data,
  total,
  divisor = 1,
}: {
  data: NatureTotal[];
  total: number;
  /** When > 1, legend values and the hover tooltip show total/divisor (labeled "/mo") instead
   * of the raw total. Percentages and donut-slice angles are unaffected — dividing every row
   * by the same constant leaves every ratio between rows identical. */
  divisor?: number;
}) {
  if (data.length === 0 || total === 0) {
    return <div className="flex h-56 items-center justify-center text-sm text-slate-400">No expenditure this period.</div>;
  }
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="mx-auto h-52 w-52 shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="name"
              innerRadius={58}
              outerRadius={88}
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="#ffffff"
              strokeWidth={2}
            >
              {data.map((d) => (
                <Cell key={d.id} fill={natureColor(d.name)} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip divisor={divisor} />} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1">
        {data.map((d) => (
          <li key={d.id}>
            <Link
              href={`/ledger?natureId=${d.id}`}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
              title="View these transactions in the Ledger"
            >
              <span className="flex min-w-0 items-center gap-2 text-slate-700">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: natureColor(d.name) }}
                  aria-hidden
                />
                <span className="truncate">{d.name}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap font-medium text-slate-900">
                {formatINR(d.total / divisor)}
                {divisor > 1 && <span className="text-slate-400">/mo</span>}
                <span className="ml-1.5 text-xs font-normal text-slate-400">
                  {((d.total / total) * 100).toFixed(0)}%
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
