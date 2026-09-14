"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/format";
import { axisTick, CHART_INK, tooltipStyle } from "./chartTheme";

export function AccountStackedBarChart({
  data,
  series,
}: {
  data: Record<string, number | string>[];
  series: { key: string; name: string; color: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="year" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
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
          formatter={((v: number, name: string) => [formatINR(v), name]) as any}
          labelStyle={{ color: CHART_INK.secondary, fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: CHART_INK.secondary }} />
        {series.map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="acct"
            fill={s.color}
            stroke="#fcfcfb"
            strokeWidth={2}
            maxBarSize={40}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
