import { Badge, Card, EmptyState } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio/data";
import { fmtDay, fmtINR, fmtPct, fmtUnits, fmtUSD, tone } from "@/lib/portfolio/format";
import { LT_MONTHS } from "@/lib/portfolio/tax";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { HealthStrip, Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../ui";

export const dynamic = "force-dynamic";

export default async function Holdings() {
  const { ctx, book, health, empty } = await getPortfolioData();
  if (empty) return <EmptyState>No portfolio data yet.</EmptyState>;
  const pos = positions(ctx, book);
  const fx = ctx.fx[ctx.fx.length - 1];
  const gain = pos.totalValue - pos.totalCost;
  const disposals = disposalRows(book);
  const realised = disposals.reduce((a, d) => a + d.gain, 0);
  const soon = pos.rows.flatMap((p) => p.lots.map((l) => ({ ...l, symbol: p.symbol }))).filter((l) => !l.isLong && l.daysToLT <= 90 && l.value > 100).sort((a, b) => a.daysToLT - b.daysToLT);

  return (
    <div className="flex flex-col gap-5">
      <HealthStrip h={health} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value" value={fmtUSD(pos.totalValue)} sub={`${fmtINR(pos.totalValue * fx)} at ${fx.toFixed(2)} · ${fmtDay(ctx.asof)}`} />
        <Tile label="Cost basis (open lots)" value={fmtUSD(pos.totalCost)} sub="incl. fees, FIFO per account" />
        <Tile label="Unrealised gain" value={fmtUSD(gain)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost (not IRR)`} />
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
        <div className="px-5 pb-4 pt-2"><Note>“Unrealised %” is a simple return on remaining cost. It is not comparable with the IRR on the Overview and Performance tabs.</Note></div>
      </Card>

      <Card>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Lots and the {LT_MONTHS}-month long-term clock</h2>
          <span className="text-xs text-slate-500">as of {fmtDay(ctx.asof)}</span>
        </div>
        {soon.length > 0 && (
          <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Turning long-term within 90 days: {soon.map((l) => `${l.symbol} lot of ${fmtDay(l.openDate)} on ${fmtDay(l.ltDate)} (${l.daysToLT}d)`).join("; ")}.
          </div>
        )}
        <div className="flex flex-col gap-2">
          {pos.rows.map((p) => (
            <details key={p.symbol} className="rounded-lg border border-slate-200">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{p.symbol}</span>
                <span className="text-xs text-slate-500">
                  {p.lots.length} lot{p.lots.length === 1 ? "" : "s"} · {p.lots.filter((l) => l.isLong).length} long-term · {fmtUSD(p.value)}
                </span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className={tableCls}>
                  <thead className={theadCls}>
                    <tr><Th right={false}>Opened</Th><Th right={false}>Account</Th><Th>Units</Th><Th>Cost/unit</Th><Th>Cost</Th><Th>Value</Th><Th>Gain</Th><Th>Age</Th><Th right={false}>Tax clock</Th></tr>
                  </thead>
                  <tbody>
                    {p.lots.map((l, j) => (
                      <tr key={j} className={rowCls}>
                        <Td right={false}>{fmtDay(l.openDate)}</Td>
                        <Td right={false}>{l.account === "IBKR" ? "IBKR" : "INDmoney"}</Td>
                        <Td>{fmtUnits(l.qty)}</Td>
                        <Td>{fmtUSD(l.costPerUnit, 2)}</Td>
                        <Td>{fmtUSD(l.cost)}</Td>
                        <Td>{fmtUSD(l.value)}</Td>
                        <Td className={tone(l.gain)}>{fmtUSD(l.gain)}</Td>
                        <Td>{l.ageDays < 730 ? `${Math.round(l.ageDays / 30.44)} mo` : `${(l.ageDays / 365.25).toFixed(1)} y`}</Td>
                        <Td right={false}>{l.isLong ? <Badge tone="emerald">Long-term</Badge> : <Badge tone="amber">Long-term on {fmtDay(l.ltDate)} ({l.daysToLT}d)</Badge>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Realised exits</div>
        {disposals.length === 0 ? (
          <div className="px-5 pb-5 pt-2 text-sm text-slate-500">No sales yet.</div>
        ) : (
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr><Th right={false}>Stock</Th><Th right={false}>Opened</Th><Th right={false}>Sold</Th><Th>Units</Th><Th>Cost</Th><Th>Proceeds</Th><Th>Gain</Th><Th>Held</Th><Th right={false}>Class</Th></tr>
            </thead>
            <tbody>
              {disposals.map((d, i) => (
                <tr key={i} className={rowCls}>
                  <Td right={false} className="font-medium text-slate-800">{d.symbol}</Td>
                  <Td right={false}>{fmtDay(d.openDate)}</Td>
                  <Td right={false}>{fmtDay(d.closeDate)}</Td>
                  <Td>{fmtUnits(d.qty)}</Td>
                  <Td>{fmtUSD(d.cost)}</Td>
                  <Td>{fmtUSD(d.proceeds)}</Td>
                  <Td className={tone(d.gain)}>{fmtUSD(d.gain)}</Td>
                  <Td>{d.days}d</Td>
                  <Td right={false}>{d.isLong ? <Badge tone="emerald">Long-term</Badge> : <Badge tone="amber">Short-term · {d.daysShort}d short of {LT_MONTHS} mo</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-5 pb-4 pt-2"><Note>FIFO per broker account, fees folded into cost and proceeds, USD. Tax classification uses a {LT_MONTHS}-month threshold for foreign shares (to be confirmed with your CA); INR gains and Schedule FA come with the tax screen.</Note></div>
      </Card>
    </div>
  );
}
