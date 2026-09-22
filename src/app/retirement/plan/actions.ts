"use server";

import { prisma } from "@/lib/prisma";
import { band, compute, computeSensitivities, loadPlan, simulate } from "@/lib/retirement";
import type { Band, RetirementDb, SensitivityResult } from "@/lib/retirement";

// Same cast pattern as retirement/baseline/actions.ts and scripts/retirement/test-db.ts — the
// narrow RetirementDb interface has no index signature, so the generated Prisma client (a
// structural superset) needs an explicit cast.
const db = prisma as unknown as RetirementDb;

export interface EvaluationResult {
  successPct: number;
  band: Band;
  depletionYear: number | null;
  medianFailYear: number | null;
  p10FailYear: number | null;
  sensitivities: SensitivityResult[];
}

/**
 * The expensive path: 9 Monte Carlo simulate() calls at 10,000 paths each (1 baseline verdict +
 * 7 sensitivity shocks, computeSensitivities' own baseline call included). Sangeeth asked for
 * this to run only on an explicit trigger, never on page load/navigation — nothing in page.tsx
 * calls this on render; only EvaluationPanel's button does, client-side, on click. Read-only (no
 * revalidatePath) — it returns data to the client rather than persisting anything, by design: OK
 * for the number to just be blank again on the next visit until re-triggered.
 *
 * Life-event editing lives on /retirement/baseline now (../baseline/actions.ts,
 * ../baseline/LifeEventEditor.tsx) — grouped there with the baseline sub-bucket editor as the
 * "infrequent configuration" page, so this file only has to hold the plan screen's one on-demand
 * calculation.
 */
export async function runEvaluationAction(planId: string, paths = 10000): Promise<EvaluationResult> {
  const plan = await loadPlan(db, planId);
  const { state } = plan;
  const result = compute(state.params, state.events, state.baseline, state.assumptions);
  const mc = simulate(result.rows, state.params, paths, state.baseline, state.assumptions);
  const sensitivities = computeSensitivities(state, paths);
  return {
    successPct: Math.round(mc.p * 100) / 100,
    band: band(mc.p),
    depletionYear: result.depl,
    medianFailYear: mc.med,
    p10FailYear: mc.p10,
    sensitivities,
  };
}
