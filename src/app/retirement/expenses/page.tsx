import Link from "next/link";
import { Badge, Card, PageHeader, EmptyState } from "@/components/ui";
import { compute, computeFundedStatus, loadPlan, presentValueByCategory, view } from "@/lib/retirement";
import type { RetirementDb, ExpenseCategoryKey } from "@/lib/retirement";
import { EXPENSE_CATEGORIES } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
import { getBaselinePlanId } from "../baseline/data";
import { UnitToggle } from "../plan/Ledger";
import { CategoryLedger } from "./CategoryLedger";

const db = prisma as unknown as RetirementDb;

export const dynamic = "force-dynamic";

const CATEGORY_KEYS = new Set(EXPENSE_CATEGORIES.map((c) => c.key));
const isCategoryKey = (v: unknown): v is ExpenseCategoryKey => typeof v === "string" && CATEGORY_KEYS.has(v as ExpenseCategoryKey);

const fmtCr = (valueL: number) =>
  (valueL / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Expense detail (post-M6). Breaks the plan home page's single "Cost of retirement" PV figure
 * into the 8 categories the engine already tracks per year (core+flex+health+ins+school+edu+emi+
 * goals = Row.exp) - same discounting, same rate, same rows; presentValueByCategory in funded.ts
 * guarantees the categories sum back to the headline number exactly (see test-funded.ts).
 *
 * Two year-by-year views live in the app, deliberately not merged: the *net* ledger (income,
 * expense, net, assets, portfolio - Ledger.tsx, at /retirement/stress) and this page's *expense,
 * by category* ledger (CategoryLedger.tsx, added 2026-09-24) - same Row[] data both times, just a
 * different cut. Clicking a category in the PV table below drills into its column here via
 * ?highlight=<key>#by-year-category, no client JS needed since it's just a link + a searchParam.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const unit: "real" | "nominal" = sp.unit === "nominal" ? "nominal" : "real";
  const highlightKey: ExpenseCategoryKey | null = isCategoryKey(sp.highlight) ? sp.highlight : null;

  let planId: string;
  try {
    planId = await getBaselinePlanId();
  } catch {
    return <EmptyState>No retirement plan found yet. Run the seed script first.</EmptyState>;
  }

  const plan = await loadPlan(db, planId);
  const { state } = plan;
  const result = compute(state.params, state.events, state.baseline, state.assumptions);
  const yearRows = view(result.rows, unit);

  const assetsHeldL = plan.items
    .filter((i) => i.group === "netWorth")
    .reduce((sum, i) => sum + i.valueL, 0);
  const funded = computeFundedStatus(result.rows, state.params.r, assetsHeldL);

  const byCategory = presentValueByCategory(result.rows, state.params.r)
    .slice()
    .sort((a, b) => b.pvL - a.pvL);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Cost of retirement, by category"
        subtitle={`${plan.name} · valuation 1 Oct 2026 · discounted at ${funded.discountRatePct}%`}
        actions={
          <Link href="/retirement/plan" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            &larr; Plan home
          </Link>
        }
      />

      <Card>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total PV of future expenses</div>
        <div className="mt-1 text-2xl font-semibold text-slate-900">₹{fmtCr(funded.pvExpensesL)} Cr</div>
        <div className="mt-1 text-xs font-medium text-slate-400">
          Every future year&apos;s gross expense, discounted back to valuation &mdash; the same figure on the plan home page
        </div>
      </Card>

      <Card>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">By category</h2>
          <span className="text-xs text-slate-500">Ranked by present value, highest first.</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="pb-2 pr-3 font-medium">Category</th>
              <th className="pb-2 pr-3 font-medium">Share</th>
              <th className="pb-2 font-medium text-right">PV</th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map((c) => {
              const pct = funded.pvExpensesL > 0 ? (c.pvL / funded.pvExpensesL) * 100 : 0;
              return (
                <tr key={c.key} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-3">
                    <Link
                      href={`/retirement/expenses?highlight=${c.key}${unit === "nominal" ? "&unit=nominal" : ""}#by-year-category`}
                      className="text-slate-700 underline decoration-slate-300 decoration-dotted underline-offset-4 hover:text-slate-900 hover:decoration-slate-500"
                    >
                      {c.label}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <span className="text-xs font-medium text-slate-500">{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="py-2 text-right font-medium text-slate-900">₹{fmtCr(c.pvL)} Cr</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-2 flex items-center justify-between text-sm">
          <span className="font-semibold text-slate-800">Total</span>
          <span className="font-semibold text-slate-800">₹{fmtCr(byCategory.reduce((s2, c) => s2 + c.pvL, 0))} Cr</span>
        </div>
        <div className="mt-1 text-xs text-slate-400">Click a category to see its year-by-year path below.</div>
      </Card>

      <CategoryLedger rows={yearRows} unit={unit} basePath="/retirement/expenses" highlightKey={highlightKey} />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Want the year-by-year net view?</h2>
            <p className="mt-1 text-xs text-slate-500">
              Income, expense, net, assets and portfolio balance per year — this page&apos;s ledger above is expense
              only, split by category; the net ledger also has the full sensitivity breakdown.
            </p>
          </div>
          <Badge tone="blue">
            <Link href="/retirement/stress">Open Stress &amp; scenarios &rarr;</Link>
          </Badge>
        </div>
      </Card>
    </div>
  );
}
