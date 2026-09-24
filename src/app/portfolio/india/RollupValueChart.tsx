"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTick, CATEGORICAL, CHART_INK, tooltipStyle } from "@/app/insights/chartTheme";
import { fmtINR } from "@/lib/portfolio/format";
import type { SeriesPt } from "@/lib/portfolio/engine";

function compact(v: number) {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(0)}L`;
  return `₹${v.toFixed(0)}`;
}

/** Blended India value vs the same INR flows in Nifty 500 TRI, plus net invested — single-benchmark
 * version of India Equity's ValueChart (that one takes a benchmark array; the rollup only ever
 * benchmarks against one index, so this keeps the prop surface simple rather than reusing that
 * component with a 1-element array). */
export function RollupValueChart({ data, benchmark, benchmarkLabel }: { data: SeriesPt[]; benchmark: string; benchmarkLabel: string }) {
  const flat = data.map((d) => ({ d: d.d, pf: d.pf, bench: d.bench[benchmark] ?? 0, inv: d.inv }));
  const lines = [
    { k: "pf", name: "India (blended)", c: CATEGORICAL[0], w: 2.5 },
    { k: "bench", name: `${benchmarkLabel} replica`, c: CATEGORICAL[1], w: 1.75 },
  ];
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={flat} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_INK.grid} vertical={false} />
        <XAxis dataKey="d" tick={axisTick} axisLine={{ stroke: CHART_INK.axis }} tickLine={false} minTickGap={48} tickFormatter={(v: string) => v.slice(0, 7)} />
        <YAxis tick={axisTick} axisLine={false} tickLine={false} width={64} tickFormatter={(v: number) => compact(v)} />
        <Tooltip
          contentStyle={tooltipStyle}
          labelStyle={{ color: CHART_INK.secondary, fontWeight: 600 }}
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- recharts formatter typing, same as the Insights charts
          formatter={((v: number, n: string) => [fmtINR(v), n]) as any}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: CHART_INK.secondary }} />
        {lines.map((l) => (
          <Line key={l.k} type="monotone" dataKey={l.k} name={l.name} stroke={l.c} strokeWidth={l.w} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        ))}
        <Line type="monotone" dataKey="inv" name="Net invested" stroke={CHART_INK.muted} strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
