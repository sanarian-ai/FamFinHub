import Link from "next/link";
import clsx from "clsx";
import { Badge, Card, EmptyState, PageHeader, StatTile } from "@/components/ui";
import { band, compute, computeSensitivities, loadPlan, simulate, view } from "@/lib/retirement";
import type { Band, RetirementDb } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
// getBaselinePlanId resolves the single household plan by name — nothing about it is
// baseline-specific, it's just where M3 first needed a plan id. Reused here rather than
// duplicated so there is exactly one place that knows the plan's name.
import { getBaselinePlanId } from "../baseline/data";
import { LifeEventEditor } from "./LifeEventEditor";

const db = prisma as unknown as RetirementDb;
const PATHS = 10000;

export const dynamic = "force-dynamic";

const BAND_TONE: Record<Band, "emerald" | "amber" | "rose"> = {
  Adequate: "emerald",
  "Just enough": "amber",
  Inadequate: "rose",
};

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

  // One compute() call feeds both the deterministic ledger table and the depletion year;
  // simulate() on top of it gives the Monte Carlo success probability. This mirrors evaluate()
  // in store.ts without a second, redundant compute() pass.
  const result = compute(state.params, state.events, state.baseline, state.assumptions);
  const mc = simulate(result.rows, state.params, PATHS, state.baseline, state.assumptions);
  const successPct = Math.round(mc.p * 100) / 100;
  const verdictBand = band(mc.p);
  const depletionYear = result.depl;

  const sensitivities = computeSensitivities(state, PATHS);
  const rows = view(result.rows, unit);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Retirement plan"
        subtitle={`${plan.name} · valuation 1 Oct 2026 · ${PATHS.toLocaleString("en-IN")} simulated paths to 2082`}
        actions={
          <Link href="/retirement/baseline" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            Review baseline inputs &rarr;
          </Link>
        }
      />

      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={BAND_TONE[verdictBand]}>{verdictBand}</Badge>
          <div className="text-sm text-slate-500">
            {successPct}% of simulated paths never run out of money before 2082.
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Success probability" value={`${successPct}%`} />
          <StatTile label="Band" value={verdictBand} />
          <StatTile
            label="Depletion (deterministic path)"
            value={depletionYear ? String(depletionYear) : "Never by 2082"}
          />
          <StatTile
            label="Median failure year (simulated)"
            value={mc.med ? String(mc.med) : "—"}
            note={mc.p10 ? `10th pct: ${mc.p10}` : undefined}
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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {sensitivities.map((s) => (
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
      </Card>

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

      <LifeEventEditor planId={planId} events={plan.events} />
    </div>
  );
}
