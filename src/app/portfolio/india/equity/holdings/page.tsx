import { Badge, Card, EmptyState } from "@/components/ui";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { buildLots } from "@/lib/portfolio/engine";
import { fmtDay, fmtPct, fmtUnits, fmtMoney, tone } from "@/lib/portfolio/format";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../../ui";
import { HolderToggle, parseQ } from "../controls";
import { accountsForHolder, ACCOUNT_LABEL } from "../constants";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/india/equity/holdings";
const CUR = "INR" as const;

export default async function IndiaEquityHoldings({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, ds, channelAccounts } = await getIndiaPortfolioData();
  const accounts: string[] = q.h === "ALL" ? channelAccounts.EQUITY : (accountsForHolder(q.h) ?? channelAccounts.EQUITY);
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) return <EmptyState>No dated trade history yet for India Equity.</EmptyState>;

  const book = buildLots(ds, accounts);
  const pos = positions(ctx, book);
  const gain = pos.totalValue - pos.totalCost;
  const disposals = disposalRows(book);
  const realised = disposals.reduce((a, d) => a + d.gain, 0);

  return (
    <div className="flex flex-col gap-5">
      <HolderToggle base={BASE} q={q} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value" value={fmtMoney(pos.totalValue, CUR)} sub={fmtDay(ctx.asof)} />
        <Tile label="Cost basis (open lots)" value={fmtMoney(pos.totalCost, CUR)} sub="incl. fees, FIFO per account" />
        <Tile label="Unrealised gain" value={fmtMoney(gain, CUR)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost (not IRR)`} />
        <Tile label="Realised gain (all exits)" value={fmtMoney(realised, CUR)} valueClass={tone(realised)} sub={`${disposals.length} disposal lots · ${new Set(disposals.map((d) => d.symbol)).size} stocks`} />
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Positions</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Stock</Th><Th>Units</Th><Th>Avg cost</Th><Th>Price</Th><Th>Value</Th><Th>Weight</Th><Th>Unrealised</Th><Th>%</Th></tr>
          </thead>
          <tbody>
            {pos.rows.map((p, i) => (
              <tr key={p.symbol} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                  {p.symbol}
                  {new Set(p.lots.map((l) => l.account)).size > 1 && <span className="ml-2"><Badge tone="blue">multiple accounts</Badge></span>}
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
          shares held by an Indian resident (24-month threshold), not domestic Indian equity's own 12-month LTCG rule — showing it here would be
          wrong. This needs its own India-domestic rule before a tax clock can be shown, not a reuse of the US one.
        </div>
        <div className="flex flex-col gap-2">
          {pos.rows.map((p) => (
            <details key={p.symbol} className="rounded-lg border border-slate-200">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-slate-800">{p.symbol}</span>
                <span className="text-xs text-slate-500">
                  {p.lots.length} lot{p.lots.length === 1 ? "" : "s"} · {fmtMoney(p.value, CUR)}
                </span>
              </summary>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className={tableCls}>
                  <thead className={theadCls}>
                    <tr><Th right={false}>Opened</Th><Th right={false}>Account</Th><Th>Units</Th><Th>Cost/unit</Th><Th>Cost</Th><Th>Value</Th><Th>Gain</Th><Th>Age</Th></tr>
                  </thead>
                  <tbody>
                    {p.lots.map((l, j) => (
                      <tr key={j} className={rowCls}>
                        <Td right={false}>{fmtDay(l.openDate)}</Td>
                        <Td right={false}>{ACCOUNT_LABEL[l.account] ?? l.account}</Td>
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
          <div className="px-5 pb-5 pt-2 text-sm text-slate-500">No sales yet.</div>
        ) : (
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr><Th right={false}>Stock</Th><Th right={false}>Opened</Th><Th right={false}>Sold</Th><Th>Units</Th><Th>Cost</Th><Th>Proceeds</Th><Th>Gain</Th><Th>Held</Th></tr>
            </thead>
            <tbody>
              {disposals.map((d, i) => (
                <tr key={i} className={rowCls}>
                  <Td right={false} className="font-medium text-slate-800">{d.symbol}</Td>
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
        <div className="px-5 pb-4 pt-2"><Note>FIFO per account, fees folded into cost and proceeds, INR. Tax classification (LTCG/STCG under India's domestic equity rules) is not shown — see the note above.</Note></div>
      </Card>
    </div>
  );
}
