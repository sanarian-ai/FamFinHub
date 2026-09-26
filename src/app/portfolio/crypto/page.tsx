import { Card, EmptyState } from "@/components/ui";
import { getCryptoPortfolioData } from "@/lib/portfolio/crypto-data";
import { fmtDay, fmtMoney, fmtPct, tone } from "@/lib/portfolio/format";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile, fmtCrypto } from "./ui";
import { SYMBOL_LABEL } from "./constants";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";
const CUR = "INR" as const;

/** Overview = a summary of current holdings (what do I hold, what's it worth) — value, positions,
 * weight, unrealised gain. Mirrors /portfolio/us and /portfolio/india/equity's Overview: IRR vs
 * benchmark lives on Performance, per-lot FIFO detail lives on Holdings & lots. */
export default async function CryptoOverview() {
  const { ctx, book, empty, lotsError } = await getCryptoPortfolioData();
  if (empty) return <EmptyState>No crypto holdings yet. Run scripts/portfolio/coindcx/seed.ts to ingest the CoinDCX order history.</EmptyState>;
  if (lotsError) return <EmptyState>Lot-building failed: {lotsError}</EmptyState>;

  const pos = positions(ctx, book);
  const gain = pos.totalValue - pos.totalCost;
  const disposals = disposalRows(book);
  const realised = disposals.reduce((a, d) => a + d.gain, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">Prices to {fmtDay(ctx.asof)}</span>
        <RefreshButton />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value" value={fmtMoney(pos.totalValue, CUR)} sub={fmtDay(ctx.asof)} />
        <Tile label="Cost basis (open lots)" value={fmtMoney(pos.totalCost, CUR)} sub="incl. fees, FIFO" />
        <Tile label="Unrealised gain" value={fmtMoney(gain, CUR)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost`} />
        <Tile label="Realised gain (all exits)" value={fmtMoney(realised, CUR)} valueClass={tone(realised)} sub={`${disposals.length} disposal lots`} />
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Positions</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Coin</Th><Th>Units</Th><Th>Avg cost</Th><Th>Price</Th><Th>Value</Th><Th>Weight</Th><Th>Unrealised</Th><Th>%</Th></tr>
          </thead>
          <tbody>
            {pos.rows.map((p, i) => (
              <tr key={p.symbol} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                  {p.symbol}
                  <span className="ml-1.5 font-normal text-slate-400">{SYMBOL_LABEL[p.symbol] ?? ""}</span>
                </Td>
                <Td>{fmtCrypto(p.units)}</Td>
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
        <div className="px-5 pb-4 pt-2"><Note>For IRR, alpha vs Nifty 50 TRI, and the value-vs-benchmark chart, see the Performance tab. For per-lot FIFO detail, see Holdings &amp; lots. Held on CoinDCX; prices from CoinGecko.</Note></div>
      </Card>
    </div>
  );
}
