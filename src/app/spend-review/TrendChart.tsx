"use client";
import { inr, full, type Engine } from "@/lib/spendReview/calc";

type Chart = ReturnType<Engine["chart"]>;

/** Stacked monthly bars with a labelled average line (and a second one for a combined selection). */
export function TrendChart({
  eng, chart, isMonthView, selectedMonth, onPickMonth,
}: {
  eng: Engine; chart: Chart; isMonthView: boolean; selectedMonth: number; onPickMonth: (m: number) => void;
}) {
  const { ms, ser, title, totals, avgT, selAvg } = chart;
  const n = ms.length;
  const W = Math.max(760, n * 36 + 60), H = 270, L = 46, R = 138, T = 22, B = 30;
  const bw = (W - L - R) / n;
  const max = Math.max(...totals, avgT, selAvg || 0, 1) * 1.12;
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const raw = max / 4, p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * p).find((s) => s >= raw) ?? raw;
  const every = n > 24 ? 3 : n > 14 ? 2 : 1;
  const ticks: number[] = [];
  for (let v = 0; v <= max; v += step) ticks.push(v);
  const y1 = y(avgT);
  let y2 = selAvg !== null ? y(selAvg) : 0;
  if (selAvg !== null && Math.abs(y2 - y1) < 14) y2 = y1 + (y2 >= y1 ? 14 : -14);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: Math.min(W, 600) }} role="img" aria-label={`Monthly spend, ${title}`}>
      <defs>
        <pattern id="sr-hp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="var(--sr-surface)" />
          <rect width="2" height="5" fill="var(--sr-ink2)" />
        </pattern>
      </defs>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--sr-line2)" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end">{v ? inr(v) : "0"}</text>
        </g>
      ))}
      {ms.map((m, i) => {
        const x = L + i * bw + bw * 0.15, w = bw * 0.7;
        let acc = 0;
        const op = isMonthView ? (m === selectedMonth ? 1 : 0.5) : 1;
        const bars = ser.map((q, k) => {
          const v = q.vals[i];
          if (v <= 0) return null;
          const top = y(acc + v), h = Math.max(0, y(acc) - y(acc + v));
          acc += v;
          return (
            <rect key={k} x={x} y={top} width={w} height={h} rx={2}
              style={{ fill: q.hatch ? "url(#sr-hp)" : q.color }}
              stroke={q.hatch ? "var(--sr-ink2)" : "var(--sr-surface)"} strokeWidth={q.hatch ? 1 : 2}
              opacity={q.dim ? 0.28 : 1} />
          );
        });
        return (
          <g key={m}>
            <g opacity={op}>{bars}</g>
            {n <= 14 && <text className="tot" x={x + w / 2} y={y(acc) - 5} textAnchor="middle" opacity={op}>{inr(acc)}</text>}
            {(i % every === 0 || (isMonthView && m === selectedMonth)) && (
              <text className={isMonthView && m === selectedMonth ? "tot" : undefined} x={x + w / 2} y={H - 10} textAnchor="middle">{eng.L10.ml(m)}</text>
            )}
            <rect x={L + i * bw} y={T} width={bw} height={H - T - B} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onPickMonth(m)}>
              <title>{`${eng.L10.mlong(m)}: ${ser.map((q) => `${q.label} ${full(q.vals[i])}`).join(", ")}`}</title>
            </rect>
          </g>
        );
      })}
      <line x1={L} x2={W - R} y1={y1} y2={y1} stroke="var(--sr-ink2)" strokeDasharray="4 4" />
      <text x={W - R + 6} y={y1 + 4}>{`avg ${inr(avgT)}/mo`}</text>
      {selAvg !== null && (
        <>
          <line x1={L} x2={W - R} y1={y(selAvg)} y2={y(selAvg)} stroke="var(--sr-ink)" strokeWidth={2} strokeDasharray="2 3" />
          <text className="tot" x={W - R + 6} y={y2 + 4}>{`selected ${inr(selAvg)}/mo`}</text>
        </>
      )}
    </svg>
  );
}
