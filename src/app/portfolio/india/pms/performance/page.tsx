import { Badge, Card, EmptyState } from "@/components/ui";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { inceptionStart, run } from "@/lib/portfolio/engine";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone } from "@/lib/portfolio/format";
import { alpha, downsample, headline, pickPeriod, periodDefs, runPeriod } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { PeriodBar, parseQ } from "../controls";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../../ui";
import { RollupValueChart } from "../../RollupValueChart";
import { PMS_BENCHMARK, PMS_BENCHMARK_LABEL } from "../constants";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/india/pms/performance";
const CUR = "INR" as const;

/**
 * Blended across all 5 PMS accounts (live Kabir PMS + 4 closed vehicles) — the closed vehicles'
 * "qty 1 = one contribution/withdrawal" encoding is exactly what run()'s cashflow-based XIRR wants,
 * so they contribute correctly here even though they're excluded from buildLots()/positions() on
 * Overview and Holdings & lots. The "By vehicle" table is the centerpiece: each account's own
 * since-inception XIRR, live and closed side by side.
 */
export default async function IndiaPmsPerformance({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, channelAccounts, lotAccounts } = await getIndiaPortfolioData();
  const accounts = channelAccounts.PMS;
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) return <EmptyState>No dated trade history yet for India PMS.</EmptyState>;

  const opts = { accounts, benchmarks: [PMS_BENCHMARK] };
  const defs = periodDefs(ctx, accounts);
  const period = pickPeriod(ctx, q.p, accounts);
  const main = runPeriod(ctx, period, { ...opts, series: true });

  const table = defs.map((d) => ({ d, r: runPeriod(ctx, d, opts) })).filter((x) => x.r.hasData);

  const byVehicle = accounts
    .map((key) => {
      const trades = ctx.trades.filter((t) => t.account === key);
      if (trades.length === 0) return null;
      const start = inceptionStart(ctx, [key]);
      const r = run(ctx, start, ctx.asof, { accounts: [key] });
      return { key, live: lotAccounts.includes(key), start, r };
    })
    .filter((x): x is { key: string; live: boolean; start: string; r: ReturnType<typeof run> } => x != null);

  const pf = headline(main.pf, main);
  const kind = pf.kind === "IRR" ? "IRR" : "Return";
  const benchH = headline(main.bench[PMS_BENCHMARK], main);
  const a = alpha(main.pf, main.bench[PMS_BENCHMARK], main);
  const invested = main.net - main.V0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <PeriodBar base={BASE} q={q} defs={defs} current={period.key} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Blended value" value={fmtMoney(main.V1, CUR)} sub={fmtDay(main.d1)} />
        <Tile label={`Blended ${kind}`} dot={CATEGORICAL[0]} value={fmtPct(pf.value)} valueClass={tone(pf.value)} sub={`P&L ${fmtMoney(main.pf.profit, CUR)}${main.annualised ? "" : " · period return, under 90 days"}`} />
        <Tile label={`${PMS_BENCHMARK_LABEL} ${kind}`} dot={CATEGORICAL[1]} value={fmtPct(benchH.value)} sub={`same flows · P&L ${fmtMoney(main.bench[PMS_BENCHMARK].profit, CUR)}`} />
        <Tile label={`Alpha vs ${PMS_BENCHMARK_LABEL}`} value={fmtPP(a)} valueClass={tone(a)} sub={`${fmtMoney(main.pf.profit - main.bench[PMS_BENCHMARK].profit, CUR)} vs index P&L`} />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{period.label}: blended value vs identical flows in {PMS_BENCHMARK_LABEL}</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(main.d0)} → {fmtDay(main.d1)} · {Math.round(main.days)} days · net invested in period {fmtMoney(invested, CUR)}
          </span>
        </div>
        <RollupValueChart data={downsample(main.series ?? [])} benchmark={PMS_BENCHMARK} benchmarkLabel={PMS_BENCHMARK_LABEL} />
        <Note>
          Replica = every rupee contributed or withdrawn across all 5 PMS accounts, on the same dates, put into {PMS_BENCHMARK_LABEL} instead. IRR is
          money-weighted (XIRR), blending the live Kabir PMS account with the 4 closed vehicles' historical flows. Periods under 90 days show the period
          return, not an annualised figure.
        </Note>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By vehicle · since inception</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Vehicle</Th><Th right={false}>Status</Th><Th right={false}>Since</Th><Th>XIRR</Th><Th>P&amp;L</Th><Th>End value</Th></tr>
          </thead>
          <tbody>
            {byVehicle.map(({ key, live, start, r }) => (
              <tr key={key} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">{key}</Td>
                <Td right={false}><Badge tone={live ? "emerald" : "slate"}>{live ? "live" : "closed"}</Badge></Td>
                <Td right={false}>{fmtDay(start)}</Td>
                <Td className={tone(r.pf.irr)}>{r.pf.irr != null ? fmtPct(r.pf.irr) : "n/a"}</Td>
                <Td className={tone(r.pf.profit)}>{fmtMoney(r.pf.profit, CUR)}</Td>
                <Td>{live ? fmtMoney(r.V1, CUR) : "–"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>Each row is that vehicle&apos;s own since-inception XIRR, independent of the others. Closed vehicles show no end value — they&apos;re fully wound down, so their return is entirely realised.</Note>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">All periods · blended</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Period</Th><Th>Blended</Th><Th>{PMS_BENCHMARK_LABEL}</Th><Th>Alpha</Th><Th>P&amp;L</Th><Th>End value</Th></tr>
          </thead>
          <tbody>
            {table.map(({ d, r }) => {
              const h = headline(r.pf, r), hb = headline(r.bench[PMS_BENCHMARK], r), al = alpha(r.pf, r.bench[PMS_BENCHMARK], r);
              return (
                <tr key={d.key} className={`${rowCls} ${d.key === period.key ? "bg-slate-50" : ""}`}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{d.label}</span>{" "}
                    {r.days < 364 && <Badge tone={r.annualised ? "slate" : "amber"}>{r.annualised ? "<1Y" : "return, <90d"}</Badge>}
                    <div className="text-xs text-slate-400">{fmtDay(r.d0)} → {fmtDay(r.d1)}</div>
                  </Td>
                  <Td className={tone(h.value)}>{h.value == null ? "n/a" : fmtPct(h.value)}</Td>
                  <Td>{hb.value == null ? "n/a" : fmtPct(hb.value)}</Td>
                  <Td className={tone(al)}>{fmtPP(al)}</Td>
                  <Td className={tone(r.pf.profit)}>{fmtMoney(r.pf.profit, CUR)}</Td>
                  <Td>{fmtMoney(r.V1, CUR)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
