import Link from "next/link";
import { Badge, Card, PageHeader, EmptyState } from "@/components/ui";
import { loadPlan, NETWORTH_CLASSES } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";
import type { Params } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
import { getBaselinePlanId } from "../baseline/data";

const db = prisma as unknown as RetirementDb;

export const dynamic = "force-dynamic";

const fmtCr = (valueL: number) =>
  (valueL / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Which Params field holds the year a net-worth class actually unlocks. Classes absent from this
 * map are liquid today (a manual figure or a live-wired one, but spendable now, not scheduled).
 * Sourced from fields the engine already tracks for its own simulation - no new concept introduced.
 *
 * Unlisted NSE shares are deliberately NOT mapped to Params.nseYear: that field drives a separate,
 * unrelated hypothetical one-time inflow (P.nseAmt) and is 0/unset on this plan - it was never the
 * unlock date for the currently-held shares. NSE's own IPO means secondary trading opens
 * 2026-09-24, so this holding is liquid now, same as the rest of the direct-equity tracker.
 */
const UNLOCK_YEAR_FIELD: Record<string, keyof Params> = {
  "networth.esops": "esopYear",
  "networth.realEstate": "propYear",
  "networth.epfNps": "epfYear",
  "networth.futureGenerali": "genYear",
};

/**
 * Asset & funding detail (post-M6). Answers the question the funded-status home page leaves open:
 * what's actually behind the "assets you hold today" figure, and how does it relate to the smaller
 * pool the Monte Carlo success% simulation runs against (state.baseline.openingPoolL + epfL, set
 * manually on the baseline screen, independent of the net-worth tracker by design - see
 * lib/retirement/networth.ts). Pure read/display layer: no engine changes, nothing written here.
 */
export default async function AssetsPage() {
  let planId: string;
  try {
    planId = await getBaselinePlanId();
  } catch {
    return <EmptyState>No retirement plan found yet. Run the seed script first.</EmptyState>;
  }

  const plan = await loadPlan(db, planId);
  const { state } = plan;
  const itemsByKey = new Map(plan.items.map((i) => [i.key, i]));

  const rows = NETWORTH_CLASSES.map((cls) => {
    const item = itemsByKey.get(cls.key);
    const valueL = item?.valueL ?? 0;
    const unlockField = UNLOCK_YEAR_FIELD[cls.key];
    const unlockYear = unlockField ? (state.params[unlockField] as number) : null;
    return { ...cls, valueL, unlockYear };
  });

  const liquidRows = rows.filter((r) => r.unlockYear == null);
  const lockedRows = rows.filter((r) => r.unlockYear != null);
  const liquidNowL = liquidRows.reduce((s, r) => s + r.valueL, 0);
  const lockedL = lockedRows.reduce((s, r) => s + r.valueL, 0);
  const totalTrackedL = liquidNowL + lockedL;

  const enginePoolL = state.baseline.openingPoolL + state.baseline.epfL;
  const gapL = liquidNowL - enginePoolL;
  const gapIsPositive = gapL > 0.5; // tracker shows more liquid net worth than the simulation uses
  const gapIsNegligible = Math.abs(gapL) <= 0.5;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Assets & funding"
        subtitle={`${plan.name} · valuation 1 Oct 2026`}
        actions={
          <Link href="/retirement/plan" className="text-sm font-medium text-slate-600 hover:text-slate-900">
            &larr; Plan home
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Liquid pool the simulation uses</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">₹{fmtCr(enginePoolL)} Cr</div>
          <div className="mt-1 text-xs font-medium text-slate-400">
            Opening liquid pool + EPF/NPS, set on the baseline screen &mdash; feeds the Monte Carlo success% run
          </div>
        </Card>
        <Card>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Total tracked net worth</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">₹{fmtCr(totalTrackedL)} Cr</div>
          <div className="mt-1 text-xs font-medium text-slate-400">
            All 13 classes below &mdash; the figure the funded-status delta on the plan home page uses
          </div>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Liquid now (tracked) vs. simulation pool</div>
            <div className={`mt-1 text-2xl font-semibold ${gapIsNegligible ? "text-slate-800" : gapIsPositive ? "text-amber-600" : "text-slate-800"}`}>
              {gapIsNegligible ? "In line" : `${gapIsPositive ? "+" : "−"}₹${fmtCr(Math.abs(gapL))} Cr`}
            </div>
          </div>
          {!gapIsNegligible && <Badge tone="amber">Not yet reflected in the simulation</Badge>}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          &ldquo;Liquid now&rdquo; below (₹{fmtCr(liquidNowL)} Cr) is what the net-worth tracker shows as spendable today,
          excluding ESOPs, real estate, EPF/NPS and the Generali policy &mdash; each locked until its own
          date. The simulation instead uses a separately maintained figure, ₹{fmtCr(enginePoolL)} Cr, entered on the baseline
          screen. The two are independent by design and can drift as the tracker gets updated and the baseline figure
          doesn&apos;t. {gapIsNegligible ? "They currently line up." : "Update the baseline screen's “Opening liquid pool” and “EPF + NPS” if you want the simulation to reflect today's tracked figure."}
        </p>
      </Card>

      <Card>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Liquid now</h2>
          <span className="text-xs text-slate-500">No scheduled unlock date &mdash; spendable at valuation.</span>
        </div>
        <AssetTable rows={liquidRows} />
        <div className="mt-2 text-right text-sm font-semibold text-slate-800">Subtotal: ₹{fmtCr(liquidNowL)} Cr</div>
      </Card>

      <Card>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Locked / scheduled</h2>
          <span className="text-xs text-slate-500">Counted at full current value on the plan home page, but not accessible until the year shown.</span>
        </div>
        <AssetTable rows={lockedRows} showUnlock />
        <div className="mt-2 text-right text-sm font-semibold text-slate-800">Subtotal: ₹{fmtCr(lockedL)} Cr</div>
      </Card>

      <div className="text-sm">
        <Link href="/retirement/baseline" className="font-medium text-slate-600 hover:text-slate-900">
          Edit values on the baseline screen &rarr;
        </Link>
      </div>
    </div>
  );
}

function AssetTable({
  rows,
  showUnlock = false,
}: {
  rows: { key: string; label: string; valueL: number; unlockYear: number | null }[];
  showUnlock?: boolean;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
          <th className="pb-2 pr-3 font-medium">Asset class</th>
          {showUnlock && <th className="pb-2 pr-3 font-medium">Unlocks</th>}
          <th className="pb-2 font-medium text-right">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-b border-slate-100 last:border-0">
            <td className="py-2 pr-3 text-slate-700">{r.label}</td>
            {showUnlock && (
              <td className="py-2 pr-3">
                <Badge tone="amber">{r.unlockYear}</Badge>
              </td>
            )}
            <td className="py-2 text-right font-medium text-slate-900">₹{fmtCr(r.valueL)} Cr</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
