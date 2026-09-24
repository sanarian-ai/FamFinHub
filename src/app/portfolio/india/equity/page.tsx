import { Badge, Card, EmptyState } from "@/components/ui";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { buildLots } from "@/lib/portfolio/engine";
import { fmtDay, fmtPct, fmtUnits, fmtMoney, tone } from "@/lib/portfolio/format";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { HolderToggle, parseQ } from "./controls";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../ui";
import { accountsForHolder } from "./constants";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/india/equity";
const CUR = "INR" as const;

/** Overview = a summary of current holdings — value, positions, weight, unrealised gain. IRR vs
 * benchmark and the value-vs-replica chart live on Performance now (see the same restructure on
 * /portfolio/us): come here first for "what do I have", go to Performance to double down on how
 * it's doing. */
export default async function IndiaEquityOverview({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, ds, channelAccounts } = await getIndiaPortfolioData();
  const accounts: string[] = q.h === "ALL" ? channelAccounts.EQUITY : (accountsForHolder(q.h) ?? channelAccounts.EQUITY);
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) {
    return (
      <EmptyState>
        No dated trade history yet for India Equity (Zerodha / Kotak Securities / IIFL) — only broker position snapshots exist today. The
        Overview, Performance and Holdings tabs will populate once tradebook data is ingested; see the qty-only snapshot on{" "}
        <a href="/portfolio/india" className="underline">the India page</a> in the meantime.
      </EmptyState>
    );
  }

  const book = buildLots(ds, accounts);
  const pos = positions(ctx, book);
  const gain = pos.totalValue - pos.totalCost;
  const disposals = disposalRows(book);
  const realised = disposals.reduce((a, d) => a + d.gain, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Prices to {fmtDay(ctx.asof)}</span>
        <HolderToggle base={BASE} q={q} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value" value={fmtMoney(pos.totalValue, CUR)} sub={fmtDay(ctx.asof)} />
        <Tile label="Cost basis (open lots)" value={fmtMoney(pos.totalCost, CUR)} sub="incl. fees, FIFO per account" />
        <Tile label="Unrealised gain" value={fmtMoney(gain, CUR)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost`} />
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
        <div className="px-5 pb-4 pt-2"><Note>For IRR, alpha vs Nifty 50/500 TRI, and the value-vs-benchmark chart, see the Performance tab. For per-lot FIFO detail, see Holdings &amp; lots.</Note></div>
      </Card>
    </div>
  );
}
