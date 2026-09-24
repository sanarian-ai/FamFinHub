import Link from "next/link";
import { Badge, Card, PageHeader, EmptyState } from "@/components/ui";
import { loadPlan } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";
import type { Params } from "@/lib/retirement";
import { NETWORTH_KEYS } from "@/lib/retirement";
import { prisma } from "@/lib/prisma";
import { getBaselinePlanId, getNetWorthActuals } from "../baseline/data";
import { NetWorthRow } from "../baseline/NetWorthRow";
import { AddNetWorthBucket } from "../baseline/AddNetWorthBucket";

const db = prisma as unknown as RetirementDb;

export const dynamic = "force-dynamic";

const fmtCr = (valueL: number) =>
  (valueL / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Which Params field holds the year a net-worth class actually unlocks. Classes absent from this
 * map are liquid today (a manual figure or a live-wired one, but spendable now, not scheduled).
 * Sourced from fields the engine already tracks for its own simulation - no new concept introduced.
 *
 * NSE's own IPO means secondary trading opens 2026-09-24, so unlisted NSE shares are liquid now,
 * same as the rest of the direct-equity tracker - no unlock field needed for that class either.
 */
const UNLOCK_YEAR_FIELD: Record<string, keyof Params> = {
  "networth.esops": "esopYear",
  "networth.realEstate": "propYear",
  "networth.epfNps": "epfYear",
};

/**
 * Asset & funding detail (post-M6). Answers the question the funded-status home page leaves open:
 * what's actually behind the "assets you hold today" figure, and how does it relate to the smaller
 * pool the Monte Carlo success% simulation runs against (state.baseline.openingPoolL + epfL, set
 * manually on the baseline screen, independent of the net-worth tracker by design - see
 * lib/retirement/networth.ts).
 *
 * Editable in place since 2026-09-24 — reuses the same NetWorthRow used on the baseline screen
 * (Save / Use live value / Keep my number / Remove), so a scenario tweak (bump a locked bucket,
 * sync a live figure, add a hypothetical one) no longer needs a trip to /retirement/baseline. This
 * is still purely the manual net-worth tracker: nothing edited here feeds back into the bottoms-up
 * Portfolio section (/portfolio/*) — see the "Liquid now vs. simulation pool" card below, which is
 * the one place a gap between this tracker and the engine's own pool is surfaced, not resolved.
 */
export default async function AssetsPage() {
  let planId: string;
  try {
    planId = await getBaselinePlanId();
  } catch {
    return <EmptyState>No retirement plan found yet. Run the seed script first.</EmptyState>;
  }

  const [plan, netWorthLive] = await Promise.all([loadPlan(db, planId), getNetWorthActuals()]);
  const { state } = plan;

  // Every tracked net-worth bucket - the 13 built-in classes plus any the user has added on this
  // screen or the baseline one (see AddNetWorthBucket.tsx). A custom bucket has no entry in
  // UNLOCK_YEAR_FIELD, so it defaults to Liquid now; there's no general way to infer a custom
  // bucket's liquidity.
  const items = plan.items
    .filter((i) => i.group === "netWorth")
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item) => {
      const unlockField = UNLOCK_YEAR_FIELD[item.key];
      const unlockYear = unlockField ? (state.params[unlockField] as number) : null;
      return { item, unlockYear };
    });

  const liquidItems = items.filter((r) => r.unlockYear == null);
  const lockedItems = items.filter((r) => r.unlockYear != null);
  const liquidNowL = liquidItems.reduce((s, r) => s + r.item.valueL, 0);
  const lockedL = lockedItems.reduce((s, r) => s + r.item.valueL, 0);
  const totalTrackedL = liquidNowL + lockedL;

  const enginePoolL = state.baseline.openingPoolL + state.baseline.epfL;
  const gapL = liquidNowL - enginePoolL;
  const gapIsPositive = gapL > 0.5; // tracker shows more liquid net worth than the simulation uses
  const gapIsNegligible = Math.abs(gapL) <= 0.5;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Assets & funding"
        subtitle={`${plan.name} · valuation 1 Oct 2026 · values below are editable — manual figures for retirement planning / scenario analysis, separate from the bottoms-up Portfolio section`}
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
            All {items.length} classes below &mdash; the figure the funded-status delta on the plan home page uses
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
          excluding ESOPs, real estate and EPF/NPS &mdash; each locked until its own
          date. The simulation instead uses a separately maintained figure, ₹{fmtCr(enginePoolL)} Cr, entered on the baseline
          screen. The two are independent by design and can drift as this tracker gets updated and the baseline figure
          doesn&apos;t. {gapIsNegligible ? "They currently line up." : "Update the baseline screen's “Opening liquid pool” and “EPF + NPS” if you want the simulation to reflect today's tracked figure."}
        </p>
      </Card>

      <Card>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Liquid now</h2>
          <span className="text-xs text-slate-500">No scheduled unlock date &mdash; spendable at valuation.</span>
        </div>
        <NetWorthEditTable planId={planId} rows={liquidItems} netWorthLive={netWorthLive} showUnlock={false} />
        <div className="mt-2 text-right text-sm font-semibold text-slate-800">Subtotal: ₹{fmtCr(liquidNowL)} Cr</div>
      </Card>

      <Card>
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-900">Locked / scheduled</h2>
          <span className="text-xs text-slate-500">Counted at full current value on the plan home page, but not accessible until the year shown.</span>
        </div>
        <NetWorthEditTable planId={planId} rows={lockedItems} netWorthLive={netWorthLive} showUnlock />
        <div className="mt-2 text-right text-sm font-semibold text-slate-800">Subtotal: ₹{fmtCr(lockedL)} Cr</div>
        <AddNetWorthBucket planId={planId} />
      </Card>

      <div className="text-sm">
        <Link href="/retirement/baseline" className="font-medium text-slate-600 hover:text-slate-900">
          Other baseline inputs (income, spend, life events) live on the baseline screen &rarr;
        </Link>
      </div>
    </div>
  );
}

function NetWorthEditTable({
  planId, rows, netWorthLive, showUnlock,
}: {
  planId: string;
  rows: { item: { key: string; label: string; valueL: number; lastReviewedAt: Date }; unlockYear: number | null }[];
  netWorthLive: Awaited<ReturnType<typeof getNetWorthActuals>>;
  showUnlock: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-slate-400">Nothing in this group yet.</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
          <th className="pb-2 pr-3 font-medium">Asset class</th>
          {showUnlock && <th className="pb-2 pr-3 font-medium">Unlocks</th>}
          <th className="pb-2 pr-3 font-medium">Manual value (₹L)</th>
          <th className="pb-2 pr-3 text-right font-medium">Live (₹L)</th>
          <th className="pb-2 pr-3 font-medium">Reviewed</th>
          <th className="pb-2 font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ item, unlockYear }) => {
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
              showUnlock={showUnlock}
              unlockYear={unlockYear}
            />
          );
        })}
      </tbody>
    </table>
  );
}
