"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { axisTick, CATEGORICAL, CHART_INK, tooltipStyle } from "@/app/insights/chartTheme";
import { fmtINR } from "@/lib/portfolio/format";
import type { SeriesPt } from "@/lib/portfolio/engine";
import { BENCHMARK_LABEL } from "./constants";

function compact(v: number) {
  const a = Math.abs(v);
  if (a >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `₹${(v / 1e5).toFixed(0)}L`;
  return `₹${v.toFixed(0)}`;
}

/** All Assets value vs each book's own benchmark replica (Nifty 50 TRI for India's flows, S&P
 * 500/QQQ for the US book's flows) — same generalized-over-`bench` shape as India Equity's own
 * ValueChart, copied locally rather than imported since it's a different (combined-household)
 * series and this page's own benchmark label set. */
export function ValueChart({ data, benchmarks }: { data: SeriesPt[]; benchmarks: readonly string[] }) {
  const flat = data.map((d) => {
    const row: Record<string, string | number> = { d: d.d, pf: d.pf, inv: d.inv };
    for (const b of benchmarks) row[b] = d.bench[b] ?? 0;
    return row;
  });
  const lines = [
    { k: "pf", name: "All Assets", c: CATEGORICAL[0], w: 2.5, dash: undefined as string | undefined },
    ...benchmarks.map((b, i) => ({ k: b, name: `${BENCHMARK_LABEL[b] ?? b} replica`, c: CATEGORICAL[(i + 1) % CATEGORICAL.length], w: 1.75, dash: undefined as string | undefined })),
    { k: "inv", name: "Net invested", c: CHART_INK.muted, w: 1.5, dash: "4 3" },
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
          <Line key={l.k} type="monotone" dataKey={l.k} name={l.name} stroke={l.c} strokeWidth={l.w} strokeDasharray={l.dash} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
