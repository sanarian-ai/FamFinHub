import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { buildLots, inceptionStart, run } from "@/lib/portfolio/engine";
import { fmtDay, fmtMoney, fmtPct, fmtUnits, tone } from "@/lib/portfolio/format";
import { disposalRows, positions } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../../ui";

export const dynamic = "force-dynamic";
const CUR = "INR" as const;

/**
 * Live Kabir PMS gets normal FIFO lots + disposals (identical structure to India Equity's Holdings
 * tab). The 4 closed vehicles get a capital-ledger view instead — per the user's explicit choice:
 * their "qty 1 = one contribution/withdrawal" trades aren't a real position lifecycle (see
 * india-data.ts's `lotAccounts` and the ebeed2e commit message for why buildLots() can't run on
 * them), so a fake FIFO lot table would be actively misleading. A dated running-balance ledger is
 * the honest representation: it shows exactly what each vehicle's money did, ending in its XIRR.
 */
export default async function IndiaPmsHoldings() {
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

  const ledgers = closedAccounts
    .map((key) => {
      const trades = [...ctx.trades.filter((t) => t.account === key)].sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
      if (trades.length === 0) return null;
      let bal = 0;
      const rows = trades.map((t) => {
        const amount = Math.abs(t.cash);
        bal += t.side === "BUY" ? amount : -amount;
        return { date: t.d, side: t.side as "BUY" | "SELL", amount, balance: bal };
      });
      const start = inceptionStart(ctx, [key]);
      const r = run(ctx, start, ctx.asof, { accounts: [key] });
      return { key, name: nameOf.get(key) ?? key, rows, irr: r.pf.irr, profit: r.pf.profit };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm font-semibold text-slate-900">Live — Kabir Capital Advisors LLP (Two Rules Value Fund)</div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Market value" value={fmtMoney(pos.totalValue, CUR)} sub={fmtDay(ctx.asof)} />
        <Tile label="Cost basis (open lots)" value={fmtMoney(pos.totalCost, CUR)} sub="incl. fees, FIFO" />
        <Tile label="Unrealised gain" value={fmtMoney(gain, CUR)} valueClass={tone(gain)} sub={`${fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)} on remaining cost (not IRR)`} />
        <Tile label="Realised gain (all exits)" value={fmtMoney(realised, CUR)} valueClass={tone(realised)} sub={`${disposals.length} disposal lots`} />
      </div>

      {pos.rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Positions</div>
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
        </Card>
      )}

      {pos.rows.length > 0 && (
        <Card>
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold text-slate-900">Lots</h2>
            <span className="text-xs text-slate-500">as of {fmtDay(ctx.asof)}</span>
          </div>
          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            No long-term/short-term tax classification is shown here yet — same gap as India Equity's Holdings tab (the lot engine's holding-period
            rule is built for foreign-listed shares, not India&apos;s domestic 12-month LTCG rule).
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
                      <tr><Th right={false}>Opened</Th><Th>Units</Th><Th>Cost/unit</Th><Th>Cost</Th><Th>Value</Th><Th>Gain</Th><Th>Age</Th></tr>
                    </thead>
                    <tbody>
                      {p.lots.map((l, j) => (
                        <tr key={j} className={rowCls}>
                          <Td right={false}>{fmtDay(l.openDate)}</Td>
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
      )}

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Realised exits — live PMS</div>
        {disposals.length === 0 ? (
          <div className="px-5 pb-5 pt-2 text-sm text-slate-500">No sales yet.</div>
        ) : (
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr><Th right={false}>Security</Th><Th right={false}>Opened</Th><Th right={false}>Sold</Th><Th>Units</Th><Th>Cost</Th><Th>Proceeds</Th><Th>Gain</Th><Th>Held</Th></tr>
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
        <div className="px-5 pb-4 pt-2"><Note>FIFO, fees folded into cost and proceeds, INR.</Note></div>
      </Card>

      {ledgers.length > 0 && (
        <>
          <div className="mt-2 text-sm font-semibold text-slate-900">
            Closed vehicles <Badge tone="slate">capital ledger</Badge>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            These 4 vehicles were fully exited before ingestion — there are no market prices to build real FIFO lots from, and their contribution/
            withdrawal encoding isn&apos;t a position lifecycle a lot matcher can run on. Each table below is a dated running balance of capital in
            and out, ending in that vehicle&apos;s own since-inception XIRR.
          </div>
          {ledgers.map((v) => (
            <Card key={v.key} className="overflow-x-auto p-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
                <div className="text-sm font-semibold text-slate-900">{v.name}</div>
                <div className="text-xs text-slate-500">
                  XIRR <span className={tone(v.irr)}>{v.irr != null ? fmtPct(v.irr) : "n/a"}</span> · P&amp;L{" "}
                  <span className={tone(v.profit)}>{fmtMoney(v.profit, CUR)}</span>
                </div>
              </div>
              <table className={tableCls}>
                <thead className={theadCls}>
                  <tr><Th right={false}>Date</Th><Th right={false}>Type</Th><Th>Amount</Th><Th>Running balance</Th></tr>
                </thead>
                <tbody>
                  {v.rows.map((row, i) => (
                    <tr key={i} className={rowCls}>
                      <Td right={false}>{fmtDay(row.date)}</Td>
                      <Td right={false}>
                        <Badge tone={row.side === "BUY" ? "blue" : "amber"}>{row.side === "BUY" ? "Contribution" : "Withdrawal"}</Badge>
                      </Td>
                      <Td className={row.side === "BUY" ? "text-slate-700" : "text-rose-600"}>
                        {row.side === "BUY" ? fmtMoney(row.amount, CUR) : `-${fmtMoney(row.amount, CUR)}`}
                      </Td>
                      <Td>{fmtMoney(row.balance, CUR)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-5 pb-4 pt-2">
                <Note>Running balance = cumulative contributions minus cumulative withdrawals — capital still in the vehicle, not a market-priced value.</Note>
              </div>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}
