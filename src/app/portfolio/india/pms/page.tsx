import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { buildLots, inceptionStart, run } from "@/lib/portfolio/engine";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { fmtDay, fmtMoney, fmtPct, fmtUnits, tone } from "@/lib/portfolio/format";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../ui";

export const dynamic = "force-dynamic";
const CUR = "INR" as const;

/**
 * India PMS Overview — holdings summary for the channel (same Overview=holdings-first convention
 * as US/India Equity/the India rollup). Two distinct sub-views, kept visibly separate:
 *
 * - Live: Kabir Capital Advisors LLP - Two Rules Value Fund (KABIR_PMS_RIA) — real FIFO positions
 *   and lots, same engine path as India Equity.
 * - Closed: 4 fully-exited pooled vehicles (Kabir Capital Ventures, Kabir Financial Ventures,
 *   Unifi Blended-Rangoli, Unifi BCAD 2 Breakout 20) — no current holdings by definition (fully
 *   wound down), so shown as a contribution/withdrawal/XIRR summary instead of positions. These
 *   accounts are excluded from buildLots()/positions() entirely — see india-data.ts's
 *   `lotAccounts` — their "qty 1 = one contribution" encoding isn't a real position lifecycle.
 *   Full XIRR detail (by-vehicle table) lives on Performance; full contribution/withdrawal ledger
 *   lives on Holdings & lots.
 */
export default async function IndiaPmsOverview() {
  const { ctx, ds, channelAccounts, lotAccounts } = await getIndiaPortfolioData();
  const pmsAccounts = channelAccounts.PMS;
  const liveAccounts = pmsAccounts.filter((a) => lotAccounts.includes(a));
  const closedAccounts = pmsAccounts.filter((a) => !lotAccounts.includes(a));

  const hasAnyTrades = ctx.trades.some((t) => pmsAccounts.includes(t.account));
  if (!hasAnyTrades) return <EmptyState>No PMS trade history found yet.</EmptyState>;

  const book = buildLots(ds, liveAccounts);
  const pos = positions(ctx, book);
  const gain = pos.totalValue - pos.totalCost;
  const disposals = disposalRows(book);
  const realised = disposals.reduce((a, d) => a + d.gain, 0);

  const closedInfo = await prisma.portfolioAccount.findMany({
    where: { key: { in: closedAccounts } },
    select: { key: true, name: true },
  });
  const nameOf = new Map(closedInfo.map((a) => [a.key, a.name]));

  const closedRows = closedAccounts
    .map((key) => {
      const trades = ctx.trades.filter((t) => t.account === key);
      if (trades.length === 0) return null;
      const contributed = trades.filter((t) => t.side === "BUY").reduce((s, t) => s + -t.cash, 0);
      const withdrawn = trades.filter((t) => t.side === "SELL").reduce((s, t) => s + t.cash, 0);
      const closedDate = trades.map((t) => t.d).sort().at(-1)!;
      const start = inceptionStart(ctx, [key]);
      const r = run(ctx, start, ctx.asof, { accounts: [key] });
      return { key, name: nameOf.get(key) ?? key, contributed, withdrawn, netPL: withdrawn - contributed, irr: r.pf.irr, closedDate };
    })
    .filter((r): r is NonNullable<typeof r> => r != null);
  const totalContributed = closedRows.reduce((s, r) => s + r.contributed, 0);
  const totalWithdrawn = closedRows.reduce((s, r) => s + r.withdrawn, 0);
  const totalNetPL = totalWithdrawn - totalContributed;

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs text-slate-500">Prices to {fmtDay(ctx.asof)}</div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value (live PMS)" value={fmtMoney(pos.totalValue, CUR)} sub={fmtDay(ctx.asof)} />
        <Tile label="Cost basis (open lots)" value={fmtMoney(pos.totalCost, CUR)} sub="incl. fees, FIFO" />
        <Tile label="Unrealised gain" value={fmtMoney(gain, CUR)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost`} />
        <Tile label="Realised gain (live PMS exits)" value={fmtMoney(realised, CUR)} valueClass={tone(realised)} sub={`${disposals.length} disposal lots`} />
      </div>

      {pos.rows.length > 0 ? (
        <Card className="overflow-x-auto p-0">
          <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Live positions — Kabir Capital Advisors LLP (Two Rules Value Fund)</div>
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr><Th right={false}>Security</Th><Th>Units</Th><Th>Avg cost</Th><Th>Price</Th><Th>Value</Th><Th>Weight</Th><Th>Unrealised</Th><Th>%</Th></tr>
            </thead>
            <tbody>
              {pos.rows.map((p, i) => (
                <tr key={p.symbol} className={rowCls}>
                  <Td right={false} className="font-medium text-slate-800">
                    <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                    {p.symbol}
                  </Td>
                  <Td>{fmtUnits(p.units)}</Td>
                  <Td>{fmtMoney(p.avgCost, CUR)}</Td>
                  <Td>{fmtMoney(p.price, CUR)}</Td>
                  <Td>{fmtMoney(p.value, CUR)}</Td>
                  <Td>{fmtPct(p.weight)}</Td>
                  <Td className={tone(p.gain)}>{fmtMoney(p.gain, CUR)}</Td>
                  <Td className={tone(p.gainPct)}>{fmtPct(p.gainPct, 1, true)}</Td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold">
                <Td right={false}>Total</Td><Td /><Td /><Td />
                <Td>{fmtMoney(pos.totalValue, CUR)}</Td><Td>100%</Td>
                <Td className={tone(gain)}>{fmtMoney(gain, CUR)}</Td><Td className={tone(gain)}>{fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)}</Td>
              </tr>
            </tbody>
          </table>
          <div className="px-5 pb-4 pt-2"><Note>For IRR, alpha vs Nifty 500 TRI, and a by-vehicle breakdown (live + closed), see the Performance tab. For per-lot FIFO detail, see Holdings &amp; lots.</Note></div>
        </Card>
      ) : (
        <Card><div className="text-sm text-slate-500">No open positions in the live PMS account right now.</div></Card>
      )}

      {closedRows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <div className="px-5 pt-4 text-sm font-semibold text-slate-900">
            Closed vehicles <Badge tone="slate">fully exited</Badge>
          </div>
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr><Th right={false}>Vehicle</Th><Th right={false}>Closed</Th><Th>Contributed</Th><Th>Withdrawn</Th><Th>Net P&amp;L</Th><Th>XIRR</Th></tr>
            </thead>
            <tbody>
              {closedRows.map((r) => (
                <tr key={r.key} className={rowCls}>
                  <Td right={false} className="font-medium text-slate-800">{r.name}</Td>
                  <Td right={false}>{fmtDay(r.closedDate)}</Td>
                  <Td>{fmtMoney(r.contributed, CUR)}</Td>
                  <Td>{fmtMoney(r.withdrawn, CUR)}</Td>
                  <Td className={tone(r.netPL)}>{fmtMoney(r.netPL, CUR)}</Td>
                  <Td className={tone(r.irr)}>{r.irr != null ? fmtPct(r.irr) : "n/a"}</Td>
                </tr>
              ))}
              <tr className="border-t border-slate-200 font-semibold">
                <Td right={false}>Total</Td><Td />
                <Td>{fmtMoney(totalContributed, CUR)}</Td>
                <Td>{fmtMoney(totalWithdrawn, CUR)}</Td>
                <Td className={tone(totalNetPL)}>{fmtMoney(totalNetPL, CUR)}</Td>
                <Td />
              </tr>
            </tbody>
          </table>
          <div className="px-5 pb-4 pt-2">
            <Note>
              Fully wound down — zero current market value by definition, so they don&apos;t appear in the tiles or live positions above. Their
              historical returns still feed the India rollup&apos;s blended PMS IRR. Full contribution/withdrawal ledger on Holdings &amp; lots;
              per-vehicle IRR vs benchmark on Performance.
            </Note>
          </div>
        </Card>
      )}
    </div>
  );
}
