import Link from "next/link";
import { EmptyState, PageHeader } from "@/components/ui";
import { loadPlan } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
import { getBaselinePlanId } from "../baseline/data";
import { AssumptionsForm } from "./AssumptionsForm";

const db = prisma as unknown as RetirementDb;

export const dynamic = "force-dynamic";

/**
 * Params & Assumptions editor (v1). The one UI gap left from the original stage map: every other
 * engine input (r, cpi, unlock years, income, education costs, Monte Carlo settings, ...) has been
 * hardcoded in lib/retirement/defaults.ts since M1. Edits go through setPlanInputs, which already
 * validates (validateParams/validateAssumptions) and persists - this page is purely the missing
 * form in front of code that has existed since the engine was first built.
 *
 * Deliberately excludes Params.mult (12x5 life-stage multiplier matrix), Params.st (stage-boundary
 * years) and Params.shiftOn - see AssumptionsForm's footnote. Those round-trip unchanged.
 */
export default async function AssumptionsPage() {
  let planId: string;
  try {
    planId = await getBaselinePlanId();
  } catch {
    return <EmptyState>No retirement plan found yet. Run the seed script first.</EmptyState>;
  }

  const plan = await loadPlan(db, planId);
  const { state } = plan;

  return (
    <div className="flex flex-col gap-5 pb-10">
      <PageHeader
        title="Assumptions"
        subtitle={`${plan.name} · every input the deterministic path and Monte Carlo simulation run on`}
        actions={
          <Link href="/retirement/plan" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            &larr; Plan home
          </Link>
        }
      />
      <AssumptionsForm planId={planId} initialParams={state.params} initialAssumptions={state.assumptions} />
    </div>
  );
}
