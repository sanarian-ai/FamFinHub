import Link from "next/link";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { loadPlan } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
import { getBaselinePlanId, getLedgerActuals, getNetWorthActuals } from "./data";
import { BaselineRow, type RowUnit } from "./BaselineRow";
import { NetWorthRow } from "./NetWorthRow";
import { LifeEventEditor } from "./LifeEventEditor";
import { NETWORTH_KEYS } from "@/lib/retirement";
import { AddNetWorthBucket } from "./AddNetWorthBucket";

const db = prisma as unknown as RetirementDb;

export const dynamic = "force-dynamic";

const SECTIONS: { title: string; note: string; keys: string[] }[] = [
  {
    title: "Essential core",
    note: "Monthly, today's money.",
    keys: ["sub.food", "sub.homeMaint", "sub.houseStaff", "sub.transport", "sub.utilities"],
  },
  {
    title: "Flexible",
    note: "Monthly, today's money.",
    keys: ["sub.lifestyle", "sub.dining", "sub.learning", "sub.giving", "sub.subs", "sub.travel", "sub.finSvc"],
  },
  {
    title: "Fixed",
    note: "Health and school are annual; EMI is monthly.",
    keys: ["health", "insurance", "school", "emi"],
  },
  {
    title: "Assets and income",
    note: "Balances and recurring non-portfolio income. No ledger reference — these aren't run-rate spend.",
    keys: ["openingPool", "epf", "rent", "genSumAssured"],
  },
];

export default async function BaselinePage() {
  let planId: string;
  try {
    planId = await getBaselinePlanId();
  } catch {
    return <EmptyState>No retirement plan found yet. Run the seed script first.</EmptyState>;
  }

  const [plan, actuals, netWorthLive] = await Promise.all([loadPlan(db, planId), getLedgerActuals(planId), getNetWorthActuals()]);
  const itemsByKey = new Map(plan.items.map((i) => [i.key, i]));
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Retirement baseline"
        subtitle={`${plan.name} · drift flagged at ${plan.driftThresholdPct}% · values are manual — the ledger is shown for reference only and is never written automatically.`}
        actions={
          <Link href="/retirement/plan" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            View plan verdict →
          </Link>
        }
      />
      {SECTIONS.map((section) => (
        <Card key={section.title}>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900">{section.title}</h2>
            <span className="text-xs text-slate-500">{section.note}</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="pb-2 pr-3 font-medium">Item</th>
                <th className="pb-2 pr-3 font-medium">Manual value (₹L)</th>
                <th className="pb-2 pr-3 text-right font-medium">Ledger, LTM (₹L)</th>
                <th className="pb-2 pr-3 text-right font-medium">Variance</th>
                <th className="pb-2 pr-3 font-medium">Reviewed</th>
                <th className="pb-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {section.keys.map((key) => {
                const item = itemsByKey.get(key);
                if (!item) return null;
                const a = actuals[key];
                const unit = item.unit as RowUnit;
                const comparable = a == null ? null : unit === "monthly" ? a.totalL / 12 : a.totalL;
                return (
                  <BaselineRow
                    key={key}
                    planId={planId}
                    itemKey={key}
                    label={item.label}
                    valueL={item.valueL}
                    unit={unit}
                    lastReviewedAt={fmtDate(item.lastReviewedAt)}
                    ledgerComparableL={comparable}
                    ledgerN={a?.n ?? 0}
                    driftThresholdPct={plan.driftThresholdPct}
                  />
                );
              })}
            </tbody>
          </table>
        </Card>
      ))}
      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Net worth by asset class</h2>
          <span className="text-xs text-slate-500">
            A separate, informational view — not fed into the plan&apos;s compute(). International equity, PMS, and mutual funds are live; everything else is manual.
          </span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="pb-2 pr-3 font-medium">Asset class</th>
              <th className="pb-2 pr-3 font-medium">Manual value (₹L)</th>
              <th className="pb-2 pr-3 text-right font-medium">Live (₹L)</th>
              <th className="pb-2 pr-3 font-medium">Reviewed</th>
              <th className="pb-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {plan.items
              .filter((i) => i.group === "netWorth")
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((item) => {
                const live = netWorthLive[item.key];
                return (
                  <NetWorthRow
                    key={item.key}
                    planId={planId}
                    itemKey={item.key}
                    label={item.label}
                    valueL={item.valueL}
                    lastReviewedAt={fmtDate(item.lastReviewedAt)}
                    liveValueL={live?.valueL ?? null}
                    liveAsOf={live?.asOf ?? null}
                    removable={!NETWORTH_KEYS.includes(item.key)}
                  />
                );
              })}
          </tbody>
        </table>
        <AddNetWorthBucket planId={planId} />
      </Card>
      <LifeEventEditor planId={planId} events={plan.events} />
    </div>
  );
}
