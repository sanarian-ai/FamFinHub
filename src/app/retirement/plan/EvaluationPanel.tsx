"use client";

import { useState, useTransition } from "react";
import { Badge, Card, StatTile } from "@/components/ui";
import { runEvaluationAction } from "./actions";
import type { EvaluationResult } from "./actions";

const BAND_TONE: Record<string, "emerald" | "amber" | "rose"> = {
  Adequate: "emerald",
  "Just enough": "amber",
  Inadequate: "rose",
};

/**
 * The Monte Carlo verdict (success probability, band, median/10th-pct failure year) and
 * sensitivities never run on page load or navigation — only when this button is clicked, per
 * Sangeeth's call: "I'm okay for it to be empty unless it's invoked." Depletion year is passed
 * in separately (it's from the cheap deterministic compute(), not simulate(), so page.tsx keeps
 * it live).
 */
export function EvaluationPanel({ planId, depletionYear }: { planId: string; depletionYear: number | null }) {
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function run() {
    setErr(null);
    startTransition(async () => {
      try {
        setResult(await runEvaluationAction(planId));
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {result ? (
              <>
                <Badge tone={BAND_TONE[result.band]}>{result.band}</Badge>
                <div className="text-sm text-slate-500">
                  {result.successPct}% of simulated paths never run out of money before 2082.
                </div>
              </>
            ) : (
              <div className="text-sm text-slate-500">Not yet calculated. Click to run 10,000 simulated paths (~10s).</div>
            )}
          </div>
          <button
            onClick={run}
            disabled={pending}
            className="rounded-md border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {pending ? "Calculating…" : result ? "Recalculate" : "Calculate success probability"}
          </button>
        </div>
        {err && <div className="mt-2 text-xs text-rose-600">{err}</div>}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Success probability" value={result ? `${result.successPct}%` : "—"} />
          <StatTile label="Band" value={result ? result.band : "—"} />
          <StatTile label="Depletion (deterministic path)" value={depletionYear ? String(depletionYear) : "Never by 2082"} />
          <StatTile
            label="Median failure year (simulated)"
            value={result?.medianFailYear ? String(result.medianFailYear) : "—"}
            note={result?.p10FailYear ? `10th pct: ${result.p10FailYear}` : undefined}
          />
        </div>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">What breaks the plan</h2>
          <span className="text-xs text-slate-500">
            Top 3 of 7 fixed one-variable scenarios, ranked by impact on success probability &mdash; scenarios, not advice.
          </span>
        </div>
        {!result ? (
          <div className="text-sm text-slate-400">Calculate success probability above to see sensitivities.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {result.sensitivities.map((s) => (
              <div key={s.key} className="rounded-lg border border-slate-200 p-3">
                <div className="text-sm font-medium text-slate-800">{s.label}</div>
                <div className="mt-2 text-lg font-semibold text-rose-600">{s.deltaPct.toFixed(1)}pp</div>
                <div className="text-xs text-slate-500">
                  {s.baselineSuccessPct}% &rarr; {s.shockedSuccessPct}%
                </div>
                {s.shockedDepletionYear !== s.baselineDepletionYear && (
                  <div className="mt-1 text-xs text-slate-400">
                    Depletion {s.baselineDepletionYear ?? "never"} &rarr; {s.shockedDepletionYear ?? "never"}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
