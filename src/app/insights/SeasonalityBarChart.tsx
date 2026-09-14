"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/format";
import { axisTick, CHART_INK, SINGLE_SERIES, tooltipStyle } from "./chartTheme";
import type { SeasonalityPoint } from "./queries";

export function SeasonalityBarChart({ data }: { data: SeasonalityPoint[] }) {
  const maxAvg = Math.max(...data.map((d) => d.avg), 1);
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="monthName" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => formatINR(v, { signDisplay: "never" })}
          width={80}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see YoYBarChart.tsx
          formatter={
            ((v: number, _n: unknown, item: { payload?: { years?: number } }) => [
              `${formatINR(v)} (avg over ${item?.payload?.years ?? "?"} yrs)`,
              "Avg monthly spend",
            ]) as any
          }
          labelStyle={{ color: CHART_INK.secondary, fontWeight: 600 }}
        />
        <Bar dataKey="avg" radius={[4, 4, 0, 0]} maxBarSize={40}>
          {data.map((d, i) => (
            <Cell key={i} fill={SINGLE_SERIES} fillOpacity={0.35 + 0.65 * (d.avg / maxAvg)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
