import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { buildLots } from "@/lib/portfolio/engine";
import { fmtDay, fmtPct, fmtUnits, fmtMoney, tone } from "@/lib/portfolio/format";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../../ui";

export const dynamic = "force-dynamic";
const CUR = "INR" as const;

export default async function IndiaMfHoldings() {
  const { ctx, ds, channelAccounts } = await getIndiaPortfolioData();
  const accounts = channelAccounts.MF;
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) return <EmptyState>No mutual fund holdings yet — upload a CAMS Consolidated Account Statement to get started.</EmptyState>;

  const book = buildLots(ds, accounts);
  const pos = positions(ctx, book);
  const gain = pos.totalValue - pos.totalCost;
  const disposals = disposalRows(book);
  const realised = disposals.reduce((a, d) => a + d.gain, 0);

  const [securities, folios] = await Promise.all([
    prisma.security.findMany({ where: { symbol: { in: [...new Set([...pos.rows.map((r) => r.symbol), ...disposals.map((d) => d.symbol)])] } }, select: { symbol: true, name: true } }),
    prisma.portfolioAccount.findMany({ where: { key: { in: accounts } }, select: { key: true, name: true } }),
  ]);
  const nameOf = new Map(securities.map((s) => [s.symbol, s.name]));
  const folioLabel = new Map(folios.map((f) => [f.key, f.name]));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value" value={fmtMoney(pos.totalValue, CUR)} sub={fmtDay(ctx.asof)} />
        <Tile label="Cost basis (open lots)" value={fmtMoney(pos.totalCost, CUR)} sub="incl. fees, FIFO per folio" />
        <Tile label="Unrealised gain" value={fmtMoney(gain, CUR)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost (not IRR)`} />
        <Tile label="Realised gain (all exits)" value={fmtMoney(realised, CUR)} valueClass={tone(realised)} sub={`${disposals.length} disposal lots · ${new Set(disposals.map((d) => d.symbol)).size} schemes`} />
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Positions</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Scheme</Th><Th>Units</Th><Th>Avg cost</Th><Th>NAV</Th><Th>Value</Th><Th>Weight</Th><Th>Unrealised</Th><Th>%</Th></tr>
          </thead>
          <tbody>
            {pos.rows.map((p, i) => (
              <tr key={p.symbol} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                  {nameOf.get(p.symbol) ?? p.symbol}
                  {new Set(p.lots.map((l) => l.account)).size > 1 && <span className="ml-2"><Badge tone="blue">multiple folios</Badge></span>}
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
        <div className="px-5 pb-4 pt-2"><Note>"Unrealised %" is a simple return on remaining cost. It is not comparable with the IRR on the Overview and Performance tabs.</Note></div>
      </Card>

      <Card>
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Lots</h2>
          <span className="text-xs text-slate-500">as of {fmtDay(ctx.asof)}</span>
        </div>
        <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          No long-term/short-term tax classification is shown here yet: the lot engine's holding-period rule (tax.ts) is built for foreign-listed
          shares held by an Indian resident (24-month threshold), not domestic mutual funds' own LTCG rule (12 months for equity-oriented schemes,
          different thresholds and rates for debt/hybrid). This needs its own India-domestic rule — the same open item already affecting India
          Equity and PMS — before a tax clock can be shown here.
        </div>
        <div className="flex flex-col gap-2">
          {pos.rows.map((p) => (
            <details key={p.symbol} className="rounded-lg border border-slate-200">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{nameOf.get(p.symbol) ?? p.symbol}</span>
                <span className="text-xs text-slate-500">
                  {p.lots.length} lot{p.lots.length === 1 ? "" : "s"} · {fmtMoney(p.value, CUR)}
                </span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className={tableCls}>
                  <thead className={theadCls}>
                    <tr><Th right={false}>Opened</Th><Th right={false}>Folio</Th><Th>Units</Th><Th>Cost/unit</Th><Th>Cost</Th><Th>Value</Th><Th>Gain</Th><Th>Age</Th></tr>
                  </thead>
                  <tbody>
                    {p.lots.map((l, j) => (
                      <tr key={j} className={rowCls}>
                        <Td right={false}>{fmtDay(l.openDate)}</Td>
                        <Td right={false} className="max-w-[12rem] truncate" title={folioLabel.get(l.account) ?? l.account}>{folioLabel.get(l.account) ?? l.account}</Td>
                        <Td>{fmtUnits(l.qty)}</Td>
                        <Td>{fmtMoney(l.costPerUnit, CUR)}</Td>
                        <Td>{fmtMoney(l.cost, CUR)}</Td>
                        <Td>{fmtMoney(l.value, CUR)}</Td>
                        <Td className={tone(l.gain)}>{fmtMoney(l.gain, CUR)}</Td>
                        <Td>{l.ageDays < 730 ? `${Math.round(l.ageDays / 30.44)} mo` : `${(l.ageDays / 365.25).toFixed(1)} y`}</Td>
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
          <div className="px-5 pb-5 pt-2 text-sm text-slate-500">No redemptions yet.</div>
        ) : (
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr><Th right={false}>Scheme</Th><Th right={false}>Opened</Th><Th right={false}>Redeemed</Th><Th>Units</Th><Th>Cost</Th><Th>Proceeds</Th><Th>Gain</Th><Th>Held</Th></tr>
            </thead>
            <tbody>
              {disposals.map((d, i) => (
                <tr key={i} className={rowCls}>
                  <Td right={false} className="font-medium text-slate-800">{nameOf.get(d.symbol) ?? d.symbol}</Td>
                  <Td right={false}>{fmtDay(d.openDate)}</Td>
                  <Td right={false}>{fmtDay(d.closeDate)}</Td>
                  <Td>{fmtUnits(d.qty)}</Td>
                  <Td>{fmtMoney(d.cost, CUR)}</Td>
                  <Td>{fmtMoney(d.proceeds, CUR)}</Td>
                  <Td className={tone(d.gain)}>{fmtMoney(d.gain, CUR)}</Td>
                  <Td>{d.days}d</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="px-5 pb-4 pt-2">
          <Note>
            FIFO per folio, fees folded into cost and proceeds, INR. Tax classification (LTCG/STCG under India's domestic mutual fund rules) is not
            shown — see the note above. A switch (redeem one scheme, buy another same-day) appears here as an ordinary redemption — none of the 95
            ingested transactions are tagged as a switch pair (switchGroupId) today, so this is a labeling note, not a known display issue.
          </Note>
        </div>
      </Card>
    </div>
  );
}
