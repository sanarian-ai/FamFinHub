"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { runEvaluationAction } from "./actions";
import type { EvaluationResult } from "./actions";

const BAND_TONE: Record<string, "emerald" | "amber" | "rose"> = {
  Adequate: "emerald",
  "Just enough": "amber",
  Inadequate: "rose",
};

/**
 * Compact success-probability badge for the plan home page — same explicit-trigger rule as the
 * full EvaluationPanel on /retirement/stress ("blank until invoked"), just a smaller footprint:
 * band + successPct, and once run, the single biggest-risk sensitivity as a one-line pointer to
 * the full breakdown. Calls the same runEvaluationAction as EvaluationPanel; each page triggers
 * its own run (no shared/cached result), consistent with results never being persisted.
 */
export function SuccessBadge({ planId }: { planId: string }) {
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

  const topRisk = result?.sensitivities?.[0];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {result ? (
          <>
            <Badge tone={BAND_TONE[result.band]}>{result.band}</Badge>
            <div className="text-sm text-slate-600">{result.successPct}% probability of never running out of money</div>
          </>
        ) : (
          <div className="text-sm text-slate-500">Success probability not yet calculated.</div>
        )}
        <button
          onClick={run}
          disabled={pending}
          className="rounded-md border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {pending ? "Calculating…" : result ? "Recalculate" : "Calculate"}
        </button>
      </div>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      {topRisk && (
        <div className="text-xs text-slate-500">
          Biggest risk: <span className="font-medium text-slate-700">{topRisk.label}</span> ({topRisk.deltaPct.toFixed(1)}pp) ·{" "}
          <a href="/retirement/stress" className="underline hover:text-slate-700">
            see all scenarios &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
