import Link from "next/link";
import clsx from "clsx";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { compute, loadPlan, view } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
// getBaselinePlanId resolves the single household plan by name — nothing about it is
// baseline-specific, it's just where M3 first needed a plan id. Reused here rather than
// duplicated so there is exactly one place that knows the plan's name.
import { getBaselinePlanId } from "../baseline/data";
import { EvaluationPanel } from "./EvaluationPanel";

const db = prisma as unknown as RetirementDb;

export const dynamic = "force-dynamic";

const fmtL = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function UnitToggle({ unit }: { unit: "real" | "nominal" }) {
  const opts: { key: "real" | "nominal"; label: string; href: string }[] = [
    { key: "real", label: "Today's money", href: "/retirement/plan" },
    { key: "nominal", label: "Nominal", href: "/retirement/plan?unit=nominal" },
  ];
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {opts.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          className={clsx(
            "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
            unit === o.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export default async function PlanPage({
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

  // Deterministic and cheap (no Monte Carlo, ~ms) — safe to run on every page load and every
  // real/nominal toggle. The Monte Carlo verdict (success probability, band) and sensitivities
  // are NOT computed here: see EvaluationPanel, which only runs them on an explicit click.
  const result = compute(state.params, state.events, state.baseline, state.assumptions);
  const depletionYear = result.depl;
  const rows = view(result.rows, unit);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Retirement plan"
        subtitle={`${plan.name} · valuation 1 Oct 2026`}
        actions={
          <Link href="/retirement/baseline" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Baseline &amp; life events &rarr;
          </Link>
        }
      />

      <EvaluationPanel planId={planId} depletionYear={depletionYear} />

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Year-by-year ledger</h2>
            <span className="text-xs text-slate-500">2026 is a Q4 stub (valuation 1 Oct 2026).</span>
          </div>
          <UnitToggle unit={unit} />
        </div>
        <div className="max-h-[520px] overflow-y-auto overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-2 pl-3 pr-3 font-medium">Year</th>
                <th className="py-2 pr-3 text-right font-medium">Income</th>
                <th className="py-2 pr-3 text-right font-medium">Expense</th>
                <th className="py-2 pr-3 text-right font-medium">Net</th>
                <th className="py-2 pr-3 text-right font-medium">Assets/inflows</th>
                <th className="py-2 pr-3 text-right font-medium">Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.Y} className={clsx("border-b border-slate-50", r.port < 0 && "bg-rose-50")}>
                  <td className="py-1.5 pl-3 pr-3 text-slate-700">
                    {r.Y}
                    {depletionYear === r.Y && (
                      <span className="ml-1.5">
                        <Badge tone="rose">depletes</Badge>
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{fmtL(r.inc)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{fmtL(r.exp)}</td>
                  <td className={clsx("py-1.5 pr-3 text-right tabular-nums", r.net < 0 ? "text-rose-600" : "text-slate-600")}>
                    {fmtL(r.net)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{fmtL(r.assets)}</td>
                  <td
                    className={clsx(
                      "py-1.5 pr-3 text-right tabular-nums font-medium",
                      r.port < 0 ? "text-rose-600" : "text-slate-800",
                    )}
                  >
                    {fmtL(r.port)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
