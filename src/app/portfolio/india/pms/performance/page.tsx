import { Badge, Card, EmptyState } from "@/components/ui";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { firstTradeDate, inceptionStart, run } from "@/lib/portfolio/engine";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone } from "@/lib/portfolio/format";
import { alpha, downsample, headline, pickPeriod, periodDefs, runPeriod } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { PeriodBar, PriceOnlyToggle, parseQ } from "../controls";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../../ui";
import { RollupValueChart } from "../../RollupValueChart";
import { BridgePanel } from "../../../BridgePanel";
import { bridgeFromRun } from "@/lib/portfolio/bridge";
import { PMS_BENCHMARK, PMS_BENCHMARK_LABEL, PMS_BENCHMARKS, PMS_BENCHMARK_LABELS } from "../constants";

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

  const opts = { accounts, benchmarks: PMS_BENCHMARKS, dividends: q.po !== "1" };
  const defs = periodDefs(ctx, accounts);
  const period = pickPeriod(ctx, q.p, accounts);
  const main = runPeriod(ctx, period, { ...opts, series: true });

  const table = defs.map((d) => ({ d, r: runPeriod(ctx, d, opts) })).filter((x) => x.r.hasData);

  const byVehicle = accounts
    .map((key) => {
      const trades = ctx.trades.filter((t) => t.account === key);
      if (trades.length === 0) return null;
      const start = inceptionStart(ctx, [key]);
      const r = run(ctx, start, ctx.asof, { accounts: [key], dividends: q.po !== "1" });
      return { key, live: lotAccounts.includes(key), start, r };
    })
    .filter((x): x is { key: string; live: boolean; start: string; r: ReturnType<typeof run> } => x != null);

  // The blended "All periods" table's End value is meaningless before the live Kabir PMS account
  // existed (pre-23 Jan 2026): the 4 closed vehicles are priced at a flat Rs 0.01 placeholder (see
  // closed-vehicle-historic-irr-ingestion-spec.md), so a period ending before that date reports a
  // near-zero blended V1 even though real capital was invested at the time -- flagged in the
  // 2026-09-26 QA audit ("misleading Rs0 end values"). P&L for the same rows is unaffected (it's
  // computed from real cash flows, not V1) so only the End value cell is blanked here.
  const liveAccounts = accounts.filter((a) => lotAccounts.includes(a));
  const liveTrades = ctx.trades.filter((t) => liveAccounts.includes(t.account));
  const liveStart = liveTrades.length ? firstTradeDate(ctx, liveAccounts) : null;

  const pf = headline(main.pf, main);
  const kind = pf.kind === "IRR" ? "IRR" : "Return";
  const benchTiles = PMS_BENCHMARKS.map((b, i) => ({ key: b, label: PMS_BENCHMARK_LABELS[b], h: headline(main.bench[b], main), a: alpha(main.pf, main.bench[b], main), dot: CATEGORICAL[(i + 1) % CATEGORICAL.length] }));
  const invested = main.net - main.V0;

  const bridge = bridgeFromRun(main);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-end gap-2">
          <PriceOnlyToggle base={BASE} q={q} />
        </div>
        <PeriodBar base={BASE} q={q} defs={defs} current={period.key} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile label="Blended value" value={fmtMoney(main.V1, CUR)} sub={fmtDay(main.d1)} />
        <Tile label={`Blended ${kind}`} dot={CATEGORICAL[0]} value={fmtPct(pf.value)} valueClass={tone(pf.value)} sub={`P&L ${fmtMoney(main.pf.profit, CUR)}${main.annualised ? "" : " · period return, under 90 days"}`} />
        {benchTiles.map((b) => (
          <Tile
            key={b.key}
            label={`${b.label} ${kind}`}
            dot={b.dot}
            value={b.h.value == null ? "n/a" : fmtPct(b.h.value)}
            sub={<>same flows · <span className={tone(b.a)}>α {fmtPP(b.a)}</span></>}
          />
        ))}
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
          {q.po === "1" ? " Dividends excluded (price-only view)." : " Dividends included (est., after withholding), where any dividend data exists."}
        </Note>
        <BridgePanel bridge={bridge} cur={CUR} />
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
            <tr>
              <Th right={false}>Period</Th><Th>Blended</Th>
              {PMS_BENCHMARKS.map((b) => <Th key={b}>{PMS_BENCHMARK_LABELS[b]}</Th>)}
              {PMS_BENCHMARKS.map((b) => <Th key={`a-${b}`}>α vs {PMS_BENCHMARK_LABELS[b]}</Th>)}
              <Th>P&amp;L</Th><Th>End value</Th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ d, r }) => {
              const h = headline(r.pf, r);
              const benchCell = (b: string) => {
                const hb = headline(r.bench[b], r);
                return hb.value == null ? <span className="text-slate-400">n/a</span> : fmtPct(hb.value);
              };
              return (
                <tr key={d.key} className={`${rowCls} ${d.key === period.key ? "bg-slate-50" : ""}`}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{d.label}</span>{" "}
                    {r.days < 364 && <Badge tone={r.annualised ? "slate" : "amber"}>{r.annualised ? "<1Y" : "return, <90d"}</Badge>}
                    <div className="text-xs text-slate-400">{fmtDay(r.d0)} → {fmtDay(r.d1)}</div>
                  </Td>
                  <Td className={tone(h.value)}>{h.value == null ? "n/a" : fmtPct(h.value)}</Td>
                  {PMS_BENCHMARKS.map((b) => <Td key={b}>{benchCell(b)}</Td>)}
                  {PMS_BENCHMARKS.map((b) => {
                    const al = alpha(r.pf, r.bench[b], r);
                    return <Td key={`a-${b}`} className={tone(al)}>{fmtPP(al)}</Td>;
                  })}
                  <Td className={tone(r.pf.profit)}>{fmtMoney(r.pf.profit, CUR)}</Td>
                  <Td>{liveStart && r.d1 < liveStart ? <span className="text-slate-400">n/a</span> : fmtMoney(r.V1, CUR)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>End value shows n/a for any period ending before the live Kabir PMS account started (23 Jan 2026) -- before that, the 4 closed vehicles priced at a flat placeholder make the blended value meaningless. P&amp;L is unaffected; it&apos;s computed from real cash flows.</Note>
        </div>
      </Card>
    </div>
  );
}
