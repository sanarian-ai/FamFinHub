"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR } from "@/lib/format";
import { axisTick, CHART_INK, SINGLE_SERIES, tooltipStyle } from "./chartTheme";
import type { YearTotal } from "./queries";

export function YoYBarChart({ data }: { data: YearTotal[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts v3's Formatter generic
          // signature doesn't structurally match a plain (value) => [node, name] callback; cast is intentional.
          formatter={((v: number) => [formatINR(v), "Spend"]) as any}
          labelStyle={{ color: CHART_INK.secondary, fontWeight: 600 }}
        />
        <Bar dataKey="total" fill={SINGLE_SERIES} radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );
}
