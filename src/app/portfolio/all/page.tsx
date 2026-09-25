import Link from "next/link";
import { Card, EmptyState } from "@/components/ui";
import { fmtINR, fmtDay } from "@/lib/portfolio/format";
import { getAssetClassBreakdown, type AssetClassGroup, type AssetClassRow } from "@/lib/portfolio/networth";
import { getManualTrackedAssets } from "@/app/retirement/baseline/data";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { Tile, Th, Td, tableCls, theadCls, rowCls, Note } from "../india/ui";
import { AllSubNav } from "./AllSubNav";

export const dynamic = "force-dynamic";

const GROUP_LABEL: Record<AssetClassGroup, string> = {
  equity: "Equity",
  fund: "Mutual funds",
  retirement: "EPF + NPS",
  manual: "Bitcoin & real estate",
};
const GROUP_COLOR: Record<AssetClassGroup, string> = {
  equity: CATEGORICAL[0],
  fund: CATEGORICAL[1],
  retirement: CATEGORICAL[2],
  manual: CATEGORICAL[3],
};

/**
 * The portfolio landing page (see PortfolioSwitcher / portfolio/page.tsx's redirect) — one
 * cross-asset view built on src/lib/portfolio/networth.ts's getAssetClassBreakdown(), the same
 * current-value queries the India and Mutual funds pages and the retirement baseline's "Use live
 * value" sync draw from. US equity first, per how this page was scoped: "start the portfolio with
 * overall portfolio and not just US equities."
 *
 * Scope: the nine broker/account-tracked classes, plus two manual ones — Bitcoin and real
 * estate — folded in via getManualTrackedAssets() (retirement/baseline/data.ts), sourced from
 * the same figures the retirement Assets screen edits (there's no broker or price feed for
 * either). Every other manual-only figure (fixed deposits, cash, ESOPs) still
 * lives only on the fuller net-worth tracker at /retirement/baseline, linked below.
 */
export default async function AllAssetsPage() {
  const [brokerRows, manualRows] = await Promise.all([getAssetClassBreakdown(), getManualTrackedAssets()]);
  const rows = [...brokerRows, ...manualRows];
  const priced = rows.filter((r): r is AssetClassRow & { valueL: number } => r.valueL != null);

  if (priced.length === 0) {
    return <EmptyState>No portfolio data yet across any tracked account. Run the seed scripts or wait for the first sync.</EmptyState>;
  }

  const totalL = priced.reduce((s, r) => s + r.valueL, 0);
  const total = totalL * 1e5; // raw rupees, for fmtINR — every valueL above is in lakhs
  const byGroup = (g: AssetClassGroup) => priced.filter((r) => r.group === g).reduce((s, r) => s + r.valueL, 0);
  // valueL here (and on every AssetClassRow) is in lakhs; fmtINR wants raw rupees, so every call
  // site below multiplies by 1e5. Percentages use the lakhs figures directly — the ratio is unaffected.
  const groupTotals: { group: AssetClassGroup; valueL: number }[] = (["equity", "fund", "retirement", "manual"] as const).map((group) => ({
    group,
    valueL: byGroup(group),
  }));

  const asOfDates = priced.map((r) => r.asOf).filter((d): d is string => d != null);
  const oldest = asOfDates.length ? asOfDates.reduce((a, b) => (a < b ? a : b)) : null;
  const newest = asOfDates.length ? asOfDates.reduce((a, b) => (a > b ? a : b)) : null;
  const missing = rows.filter((r) => r.valueL == null);

  return (
    <div className="space-y-5">
      <AllSubNav />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <Tile label="Total tracked" value={fmtINR(total)} sub={newest ? `As of ${fmtDay(newest)}` : undefined} />
        {groupTotals.map((g) => (
          <Tile
            key={g.group}
            label={GROUP_LABEL[g.group]}
            value={fmtINR(g.valueL * 1e5)}
            sub={`${((g.valueL / totalL) * 100).toFixed(1)}% of total`}
          />
        ))}
      </div>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Composition</h2>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          {groupTotals.map((g) => (
            <div
              key={g.group}
              style={{ width: `${Math.max(0.5, (g.valueL / totalL) * 100)}%`, background: GROUP_COLOR[g.group] }}
              title={`${GROUP_LABEL[g.group]}: ${fmtINR(g.valueL * 1e5)}`}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          {groupTotals.map((g) => (
            <span key={g.group} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: GROUP_COLOR[g.group] }} />
              {GROUP_LABEL[g.group]} · {fmtINR(g.valueL * 1e5)} ({((g.valueL / totalL) * 100).toFixed(1)}%)
            </span>
          ))}
        </div>
      </Card>

      {oldest && newest && oldest !== newest && (
        <Note>
          Asset classes aren&apos;t all priced as of the same date (oldest {fmtDay(oldest)}, newest {fmtDay(newest)}) —
          each class shows its own account&apos;s last known price.
        </Note>
      )}
      {missing.length > 0 && (
        <Note>
          No current data for: {missing.map((r) => r.label).join(", ")}.
        </Note>
      )}
      <Note>
        BitCoin and Real estate have no broker or price feed — their value and &quot;as of&quot; date are
        whatever was last saved on the retirement Assets screen, not a market price.
      </Note>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <Th right={false}>Asset class</Th>
              <Th right={false}>As of</Th>
              <Th>Value (INR)</Th>
              <Th right={false}>Share</Th>
              <Th right={false}></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const weight = r.valueL != null ? r.valueL / totalL : null;
              return (
                <tr key={r.key} className={rowCls}>
                  <Td right={false}>
                    <div className="font-medium text-slate-900">{r.label}</div>
                    <div className="text-xs text-slate-500">{GROUP_LABEL[r.group]}</div>
                  </Td>
                  <Td right={false} className="text-slate-500">{r.asOf ? fmtDay(r.asOf) : "–"}</Td>
                  <Td>{r.valueL != null ? fmtINR(r.valueL * 1e5) : "–"}</Td>
                  <Td right={false}>
                    {weight != null ? (
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-1.5 rounded-full bg-slate-400" style={{ width: `${Math.max(1, weight * 100)}%` }} />
                        </div>
                        <span className="tabular-nums text-slate-500">{(weight * 100).toFixed(1)}%</span>
                      </div>
                    ) : (
                      "–"
                    )}
                  </Td>
                  <Td right={false}>
                    {r.href && (
                      <Link href={r.href} className="text-xs font-medium text-slate-500 hover:text-slate-900">
                        View &rarr;
                      </Link>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-sm">
        <Link href="/retirement/baseline" className="font-medium text-slate-600 hover:text-slate-900">
          Full net worth (incl. FDs, cash, ESOPs and other manual figures) on the retirement baseline screen &rarr;
        </Link>
      </div>
    </div>
  );
}
