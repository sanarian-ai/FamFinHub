import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { buildLots } from "@/lib/portfolio/engine";
import { fmtDay, fmtPct, fmtUnits, fmtMoney, tone } from "@/lib/portfolio/format";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../ui";
import { RefreshButton } from "./RefreshButton";
import { CATEGORY_LABEL } from "./constants";

export const dynamic = "force-dynamic";
const CUR = "INR" as const;

/** Overview = a summary of current holdings — value, positions, weight, unrealised gain. Same
 * holdings-summary/deep-dive split as every other channel (Overview vs Performance, locked in
 * step 3): come here first for "what do I have", go to Performance for IRR vs the four Nifty TRI
 * indices. Positions are now engine-backed (buildLots/positions over real dated transactions, same
 * as Equity/PMS) rather than the old qty x latest-NAV snapshot — that page is retired now that the
 * NAV history backfill (step 5) gives run()/buildLots() real prices to work with, not just today's. */
export default async function IndiaMfOverview() {
  const { ctx, ds, channelAccounts } = await getIndiaPortfolioData();
  const accounts = channelAccounts.MF;
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) {
    return <EmptyState>No mutual fund holdings yet — upload a CAMS Consolidated Account Statement to get started.</EmptyState>;
  }

  const book = buildLots(ds, accounts);
  const pos = positions(ctx, book);
  const gain = pos.totalValue - pos.totalCost;
  const disposals = disposalRows(book);
  const realised = disposals.reduce((a, d) => a + d.gain, 0);

  const securities = await prisma.security.findMany({
    where: { symbol: { in: pos.rows.map((r) => r.symbol) } },
    select: { symbol: true, name: true, mfCategory: true },
  });
  const nameOf = new Map(securities.map((s) => [s.symbol, s.name]));
  const catOf = new Map(securities.map((s) => [s.symbol, s.mfCategory]));
  const folioCount = new Set(accounts).size;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Prices to {fmtDay(ctx.asof)} · {pos.rows.length} scheme{pos.rows.length === 1 ? "" : "s"} across {folioCount} folios</span>
        <RefreshButton />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value" value={fmtMoney(pos.totalValue, CUR)} sub={fmtDay(ctx.asof)} />
        <Tile label="Cost basis (open lots)" value={fmtMoney(pos.totalCost, CUR)} sub="incl. fees, FIFO per folio" />
        <Tile label="Unrealised gain" value={fmtMoney(gain, CUR)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost`} />
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
                  {catOf.get(p.symbol) && <span className="ml-2"><Badge tone="slate">{CATEGORY_LABEL[catOf.get(p.symbol) as string] ?? catOf.get(p.symbol)}</Badge></span>}
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
        <div className="px-5 pb-4 pt-2">
          <Note>
            For IRR, alpha vs the four Nifty TRI indices, and the value-vs-benchmark chart, see the Performance tab. For per-lot FIFO detail, see
            Holdings &amp; lots. Category badges (Equity/Debt/Hybrid/Commodity) are for identification only — benchmarking is aggregate-channel, not
            per-scheme.
          </Note>
        </div>
      </Card>
    </div>
  );
}
