import Link from "next/link";
import { Card, PageHeader, StatTile, EmptyState } from "@/components/ui";
import { compute, computeFundedStatus, loadPlan, NETWORTH_KEYS } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
import { getBaselinePlanId } from "../baseline/data";
import { SuccessBadge } from "./SuccessBadge";

const db = prisma as unknown as RetirementDb;

export const dynamic = "force-dynamic";

const fmtCr = (valueL: number) =>
  (valueL / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Plan home (M6). Leads with funded status — PV of everything the plan will ever spend vs. what's
 * actually held today — rather than a probability number alone, per the read that a bare success%
 * doesn't say how big the gap is or what it would take to close it. Monte Carlo success% (needs an
 * explicit click, see SuccessBadge) sits right next to it as the risk/confidence layer; the year-
 * by-year ledger and full sensitivity breakdown moved to /retirement/stress (M4's original content,
 * relocated, not rebuilt).
 */
export default async function PlanPage() {
  let planId: string;
  try {
    planId = await getBaselinePlanId();
  } catch {
    return <EmptyState>No retirement plan found yet. Run the seed script first.</EmptyState>;
  }

  const plan = await loadPlan(db, planId);
  const { state } = plan;

  // Deterministic and cheap (no Monte Carlo) — safe on every page load, same as before M6.
  const result = compute(state.params, state.events, state.baseline, state.assumptions);
  const depletionYear = result.depl;

  const assetsHeldL = plan.items
    .filter((i) => NETWORTH_KEYS.includes(i.key))
    .reduce((sum, i) => sum + i.valueL, 0);
  const funded = computeFundedStatus(result.rows, state.params.r, assetsHeldL);
  const deficit = funded.deltaL < 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Retirement plan"
        subtitle={`${plan.name} · valuation 1 Oct 2026`}
        actions={
          <div className="flex items-center gap-4">
            <Link href="/retirement/stress" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Stress &amp; scenarios &rarr;
            </Link>
            <Link href="/retirement/baseline" className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Baseline &amp; life events &rarr;
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link href="/retirement/assets" className="block transition hover:opacity-80">
          <StatTile
            label="Assets you hold today"
            value={`₹${fmtCr(funded.assetsHeldL)} Cr`}
            note="Net worth tracker, current value — tap for the breakdown"
          />
        </Link>
        <Link href="/retirement/expenses" className="block transition hover:opacity-80">
          <StatTile
            label="Cost of retirement"
            value={`₹${fmtCr(funded.pvExpensesL)} Cr`}
            note={`PV of all future expenses, at ${funded.discountRatePct}% — tap for the breakdown`}
          />
        </Link>
        <StatTile
          label="Runs out (deterministic path)"
          value={depletionYear ? String(depletionYear) : "Never by 2082"}
          note="No volatility — the smooth-return path, not a simulation"
        />
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {deficit ? "Funding gap" : "Funding surplus"}
            </div>
            <div className={`mt-1 text-3xl font-semibold ${deficit ? "text-rose-600" : "text-emerald-600"}`}>
              {deficit ? "−" : "+"}₹{fmtCr(Math.abs(funded.deltaL))} Cr
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Funded ratio</div>
            <div className="mt-1 text-xl font-semibold text-slate-800">{funded.fundedRatioPct.toFixed(0)}%</div>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Assets you hold today, compared to every future expense the plan projects — before counting any future income
          (Ria&apos;s salary, rent, the Generali payout) or one-time unlocks (ESOP, EPF/NPS, the property sale). Those are
          what the success probability below already accounts for; this number answers a narrower question on purpose:
          could what&apos;s held today alone cover everything ahead.
        </p>
      </Card>

      <Card>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Probability of success</h2>
          <span className="text-xs text-slate-500">10,000 simulated paths, market volatility included.</span>
        </div>
        <SuccessBadge planId={planId} />
      </Card>
    </div>
  );
}
