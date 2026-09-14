"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NATURE_COLOR_ORDER, natureColor } from "./colors";
import { formatINR } from "@/lib/format";

export interface TrendDatum {
  month: string;
  [natureName: string]: number | string;
}

const MUTED = "#898781";
const GRID = "#e1e0d9";
const PRIMARY_INK = "#0b0b0b";

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  const nonZero = payload.filter((p: any) => p.value);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-md">
      <div className="mb-1.5 font-semibold text-slate-900">{label}</div>
      {nonZero
        .sort((a: any, b: any) => b.value - a.value)
        .map((p: any) => (
          <div key={p.dataKey} className="flex items-center justify-between gap-4 py-0.5">
            <span className="flex items-center gap-1.5 text-slate-600">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.fill }} />
              {p.dataKey}
            </span>
            <span className="font-medium text-slate-900">{formatINR(p.value)}</span>
          </div>
        ))}
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-slate-100 pt-1.5 font-semibold text-slate-900">
        <span>Total</span>
        <span>{formatINR(total)}</span>
      </div>
    </div>
  );
}

export function TrendChart({ data }: { data: TrendDatum[] }) {
  const hasAny = data.some((d) => NATURE_COLOR_ORDER.some((n) => Number(d[n] ?? 0) > 0));
  if (!hasAny) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-400">
        No expenditure recorded in this window yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={288}>
      <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis
          dataKey="month"
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Legend
          wrapperStyle={{ fontSize: 11, color: PRIMARY_INK, paddingTop: 8 }}
          iconType="circle"
          iconSize={8}
        />
        {NATURE_COLOR_ORDER.map((nature) => (
          <Bar
            key={nature}
            dataKey={nature}
            stackId="spend"
            fill={natureColor(nature)}
            stroke="#ffffff"
            strokeWidth={2}
            radius={0}
            maxBarSize={40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
