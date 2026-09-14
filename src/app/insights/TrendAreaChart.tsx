"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/format";
import { axisTick, CHART_INK, SINGLE_SERIES, tooltipStyle } from "./chartTheme";
import type { YearTotal } from "./queries";

export function TrendAreaChart({ data }: { data: YearTotal[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SINGLE_SERIES} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SINGLE_SERIES} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="label" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
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
          formatter={((v: number) => [formatINR(v), "Spend"]) as any}
          labelStyle={{ color: CHART_INK.secondary, fontWeight: 600 }}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke={SINGLE_SERIES}
          strokeWidth={2}
          fill="url(#trendFill)"
          dot={{ r: 3, fill: SINGLE_SERIES, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
