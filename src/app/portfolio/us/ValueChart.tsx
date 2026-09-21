"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTick, CATEGORICAL, CHART_INK, tooltipStyle } from "@/app/insights/chartTheme";

export type Pt = { d: string; pf: number; SPY: number; QQQ: number; inv: number };

function compact(v: number, cur: "USD" | "INR") {
  const a = Math.abs(v);
  if (cur === "INR") return a >= 1e7 ? `₹${(v / 1e7).toFixed(1)}Cr` : a >= 1e5 ? `₹${(v / 1e5).toFixed(0)}L` : `₹${v.toFixed(0)}`;
  return a >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : a >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`;
}

/** Portfolio value vs what the same dollar flows would be worth in SPY / QQQ, plus net invested. */
export function ValueChart({ data, cur }: { data: Pt[]; cur: "USD" | "INR" }) {
  const lines = [
    { k: "pf", name: "Portfolio", c: CATEGORICAL[0], w: 2.5, dash: undefined },
    { k: "SPY", name: "S&P 500 (SPY) replica", c: CATEGORICAL[1], w: 1.75, dash: undefined },
    { k: "QQQ", name: "Nasdaq-100 (QQQ) replica", c: CATEGORICAL[2], w: 1.75, dash: undefined },
    { k: "inv", name: "Net invested", c: CHART_INK.muted, w: 1.5, dash: "4 3" },
  ] as const;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="d" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} minTickGap={48} tickFormatter={(v: string) => v.slice(0, 7)} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => compact(v, cur)} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: CHART_INK.secondary, fontWeight: 600 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts formatter typing, same as the Insights charts
          formatter={((v: number, n: string) => [compact(v, cur), n]) as any}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: CHART_INK.secondary }} />
        {lines.map((l) => (
          <Line key={l.k} type="monotone" dataKey={l.k} name={l.name} stroke={l.c} strokeWidth={l.w} strokeDasharray={l.dash} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
