"use client";

import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART_INK, SINGLE_SERIES, axisTick, tooltipStyle } from "@/app/insights/chartTheme";

export interface TrajectoryPoint {
  year: number;
  balanceL: number;
}

const fmtCr = (v: number) => (v / 100).toLocaleString("en-IN", { maximumFractionDigits: 1 });

/**
 * Portfolio-balance trajectory, real terms (today's money) - the same compute() rows the top-line
 * PV figures and the full year-by-year ledger (/retirement/stress) both come from, made visible on
 * the plan home page itself instead of only reachable by clicking through. Reuses the Insights
 * screen's validated chart palette (chartTheme.ts) rather than introducing a second one; single
 * series, so no legend box per the dataviz skill (the card title names it).
 */
export function PortfolioTrajectoryChart({ data, depletionYear }: { data: TrajectoryPoint[]; depletionYear: number | null }) {
  const first = data[0]?.year;
  const last = data[data.length - 1]?.year;
  const decadeTicks = data.map((d) => d.year).filter((y) => y % 10 === 0 || y === first || y === last);
  const everNegative = data.some((d) => d.balanceL < 0);

  return (
    <ResponsiveContainer width="100%" height={220}>
      <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="portfolioFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={SINGLE_SERIES} stopOpacity={0.28} />
            <stop offset="100%" stopColor={SINGLE_SERIES} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="year" ticks={decadeTicks} tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} />
        <YAxis
          tick={axisTick}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `₹${fmtCr(v)}Cr`}
          width={64}
        />
        {everNegative && <ReferenceLine y={0} stroke={CHART_INK.axis} strokeDasharray="2 2" />}
        {depletionYear != null && (
          <ReferenceLine
            x={depletionYear}
            stroke={CHART_INK.badText}
            strokeDasharray="4 4"
            label={{ value: `Runs out ${depletionYear}`, position: "insideTopRight", fill: CHART_INK.badText, fontSize: 11 }}
          />
        )}
        <Tooltip
          contentStyle={tooltipStyle}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches TrendAreaChart.tsx's existing pattern
          formatter={((v: number) => [`₹${fmtCr(v)} Cr`, "Portfolio balance"]) as any}
          labelFormatter={(y) => `Year ${y}`}
        />
        <Area
          type="monotone"
          dataKey="balanceL"
          stroke={SINGLE_SERIES}
          strokeWidth={2}
          fill="url(#portfolioFill)"
          dot={false}
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
