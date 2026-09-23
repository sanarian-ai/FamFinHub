import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";
import { compute, loadPlan, view } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
import { getBaselinePlanId } from "../baseline/data";
import { EvaluationPanel } from "../plan/EvaluationPanel";
import { Ledger } from "../plan/Ledger";

const db = prisma as unknown as RetirementDb;

export const dynamic = "force-dynamic";

/**
 * Stress & scenarios (M6). This is M4's original /retirement/plan content — Monte Carlo verdict,
 * "what breaks the plan" sensitivities, and the year-by-year ledger — relocated wholesale, not
 * rebuilt, once the plan home page (/retirement/plan) was freed up to lead with funded status
 * instead. EvaluationPanel and Ledger are unchanged components, just imported from their original
 * location in ../plan/ rather than duplicated here.
 */
export default async function StressPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const unit: "real" | "nominal" = sp.unit === "nominal" ? "nominal" : "real";

  let planId: string;
  try {
    planId = await getBaselinePlanId();
  } catch {
    return <EmptyState>No retirement plan found yet. Run the seed script first.</EmptyState>;
  }

  const plan = await loadPlan(db, planId);
  const { state } = plan;

  const result = compute(state.params, state.events, state.baseline, state.assumptions);
  const depletionYear = result.depl;
  const rows = view(result.rows, unit);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Stress & scenarios"
        subtitle={`${plan.name} · valuation 1 Oct 2026`}
        actions={
          <Link href="/retirement/plan" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            &larr; Plan home
          </Link>
        }
      />

      <EvaluationPanel planId={planId} depletionYear={depletionYear} />

      <Ledger rows={rows} depletionYear={depletionYear} unit={unit} basePath="/retirement/stress" />
    </div>
  );
}
