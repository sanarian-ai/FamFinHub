import { Badge, Card, EmptyState } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio/data";
import { fmtDay, fmtINR, fmtPct, fmtUnits, fmtUSD, tone } from "@/lib/portfolio/format";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { HealthStrip, Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "./ui";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";

/** Overview = a summary of current holdings (what do I hold, what's it worth) — value, positions,
 * weight, unrealised gain. Performance (IRR vs benchmark, alpha, value-vs-replica chart) lives on
 * its own tab now: come here first for "what do I have", go to Performance to "double down" on how
 * it's doing. Mirrors holdings/page.tsx's Positions table (the deeper Holdings & lots tab adds the
 * per-lot FIFO/tax-clock detail and realised exits on top of this same summary). */
export default async function Overview() {
  const { ctx, book, health, empty } = await getPortfolioData();
  if (empty) return <EmptyState>No portfolio data yet. Run the seed script or wait for the first sync.</EmptyState>;

  const pos = positions(ctx, book);
  const fx = ctx.fx[ctx.fx.length - 1];
  const gain = pos.totalValue - pos.totalCost;
  const disposals = disposalRows(book);
  const realised = disposals.reduce((a, d) => a + d.gain, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <HealthStrip h={health} />
        <RefreshButton />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value" value={fmtUSD(pos.totalValue)} sub={`${fmtINR(pos.totalValue * fx)} at ${fx.toFixed(2)} · ${fmtDay(ctx.asof)}`} />
        <Tile label="Cost basis (open lots)" value={fmtUSD(pos.totalCost)} sub="incl. fees, FIFO per account" />
        <Tile label="Unrealised gain" value={fmtUSD(gain)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost`} />
        <Tile label="Realised gain (all exits)" value={fmtUSD(realised)} valueClass={tone(realised)} sub={`${disposals.length} disposal lots · ${new Set(disposals.map((d) => d.symbol)).size} stocks`} />
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Positions</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Stock</Th><Th>Units</Th><Th>Avg cost</Th><Th>Price</Th><Th>Value (USD)</Th><Th>Value (INR)</Th><Th>Weight</Th><Th>Unrealised</Th><Th>%</Th></tr>
          </thead>
          <tbody>
            {pos.rows.map((p, i) => (
              <tr key={p.symbol} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                  {p.symbol}
                  {new Set(p.lots.map((l) => l.account)).size > 1 && <span className="ml-2"><Badge tone="blue">2 brokers</Badge></span>}
                </Td>
                <Td>{fmtUnits(p.units)}</Td>
                <Td>{fmtUSD(p.avgCost, 2)}</Td>
                <Td>{fmtUSD(p.price, 2)}</Td>
                <Td>{fmtUSD(p.value)}</Td>
                <Td>{fmtINR(p.value * fx)}</Td>
                <Td>{fmtPct(p.weight)}</Td>
                <Td className={tone(p.gain)}>{fmtUSD(p.gain)}</Td>
                <Td className={tone(p.gainPct)}>{fmtPct(p.gainPct, 1, true)}</Td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 font-semibold">
              <Td right={false}>Total</Td><Td /><Td /><Td />
              <Td>{fmtUSD(pos.totalValue)}</Td><Td>{fmtINR(pos.totalValue * fx)}</Td><Td>100%</Td>
              <Td className={tone(gain)}>{fmtUSD(gain)}</Td><Td className={tone(gain)}>{fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)}</Td>
            </tr>
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2"><Note>For IRR, alpha vs SPY/QQQ, and the value-vs-benchmark chart, see the Performance tab. For per-lot FIFO detail and the tax clock, see Holdings &amp; lots.</Note></div>
      </Card>
    </div>
  );
}
