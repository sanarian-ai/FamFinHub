"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatINR } from "@/lib/format";

export interface CashFlowDatum {
  month: string;
  income: number;
  expense: number;
  net: number;
}

const MUTED = "#898781";
const GRID = "#e1e0d9";
const INCOME_COLOR = "#1baf7a";
const EXPENSE_COLOR = "#e34948";
const NET_COLOR = "#0b0b0b";

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const byKey = Object.fromEntries(payload.map((p: any) => [p.dataKey, p.value]));
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-md">
      <div className="mb-1.5 font-semibold text-slate-900">{label}</div>
      <div className="flex items-center justify-between gap-4 py-0.5">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: INCOME_COLOR }} />
          Income
        </span>
        <span className="font-medium text-slate-900">{formatINR(byKey.income ?? 0)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 py-0.5">
        <span className="flex items-center gap-1.5 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: EXPENSE_COLOR }} />
          Expense
        </span>
        <span className="font-medium text-slate-900">{formatINR(byKey.expense ?? 0)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-4 border-t border-slate-100 pt-1.5 font-semibold text-slate-900">
        <span>Net</span>
        <span>{formatINR(byKey.net ?? 0)}</span>
      </div>
    </div>
  );
}

export function CashFlowTrendChart({ data }: { data: CashFlowDatum[] }) {
  const hasAny = data.some((d) => d.income > 0 || d.expense > 0);
  if (!hasAny) {
    return (
      <div className="flex h-72 items-center justify-center text-sm text-slate-400">
        No income or expense recorded in this window yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={288}>
      <ComposedChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 11 }} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(11,11,11,0.04)" }} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#0b0b0b", paddingTop: 8 }} iconType="circle" iconSize={8} />
        <Bar dataKey="income" name="Income" fill={INCOME_COLOR} radius={[2, 2, 0, 0]} maxBarSize={28} />
        <Bar dataKey="expense" name="Expense" fill={EXPENSE_COLOR} radius={[2, 2, 0, 0]} maxBarSize={28} />
        <Line
          dataKey="net"
          name="Net"
          stroke={NET_COLOR}
          strokeWidth={2}
          dot={{ r: 3, fill: NET_COLOR }}
          type="monotone"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
