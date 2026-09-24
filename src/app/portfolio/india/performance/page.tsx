import { Badge, Card, EmptyState } from "@/components/ui";
import { getIndiaPortfolioData, type HolderKey } from "@/lib/portfolio/india-data";
import { inceptionStart } from "@/lib/portfolio/engine";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone } from "@/lib/portfolio/format";
import { alpha, downsample, headline, pickPeriod, periodDefs, runPeriod } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { HolderToggle, OpenClosedToggle, PeriodBar, parseQ } from "../rollupControls";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../ui";
import { RollupValueChart } from "../RollupValueChart";
import { RollupSubNav } from "../RollupSubNav";
import { CHANNEL_LABEL, CHANNEL_ORDER, HOLDER_LABEL, HOLDER_ORDER, INDIA_BENCHMARK, OC_LABEL } from "../rollupConstants";
import { symbolsForFilter } from "../rollupData";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/india/performance";
const CUR = "INR" as const;
const BENCHMARK_LABEL = "Nifty 500 TRI";
const CHANNEL_HREF: Partial<Record<(typeof CHANNEL_ORDER)[number], string>> = { EQUITY: "/portfolio/india/equity", PMS: "/portfolio/india/pms", MF: "/portfolio/india/mf" };

/**
 * India rollup Performance — blended IRR vs a single Nifty 500 TRI benchmark, plus three cuts:
 * duration (All periods), channel (Equity/PMS/MF — P&L and value sum exactly to the blended total;
 * IRR does not, since it's money-weighted per scope, not additive), and holder (Sangeeth/Ria/
 * Household). Open/Closed/All restricts every cut to currently-held or fully-exited symbols within
 * its own scope — see rollupData.ts's symbolsForFilter.
 */
export default async function IndiaPerformance({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, channelAccounts, holderAccounts } = await getIndiaPortfolioData();
  const accounts = holderAccounts[q.h];
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) {
    return <EmptyState>No dated trade history yet across India accounts for {HOLDER_LABEL[q.h]}.</EmptyState>;
  }

  const defs = periodDefs(ctx, accounts);
  const period = pickPeriod(ctx, q.p, accounts);
  const symbols = symbolsForFilter(ctx, accounts, q.oc);
  const opts = { accounts, benchmarks: [INDIA_BENCHMARK], symbols };
  const main = runPeriod(ctx, period, { ...opts, series: true });

  const table = defs.map((d) => ({ d, r: runPeriod(ctx, d, opts) })).filter((x) => x.r.hasData);

  const byChannel = CHANNEL_ORDER.map((ch) => {
    const chAccounts = accounts.filter((a) => channelAccounts[ch].includes(a));
    const chHasTrades = ctx.trades.some((t) => chAccounts.includes(t.account));
    const chSymbols = symbolsForFilter(ctx, chAccounts, q.oc);
    const r = runPeriod(ctx, period, { accounts: chAccounts, benchmarks: [INDIA_BENCHMARK], symbols: chSymbols });
    return { ch, chHasTrades, r };
  });
  const channelProfitSum = byChannel.reduce((s, x) => s + x.r.pf.profit, 0);
  const channelV1Sum = byChannel.reduce((s, x) => s + x.r.V1, 0);
  const reconciled = Math.abs(channelProfitSum - main.pf.profit) < 1 && Math.abs(channelV1Sum - main.V1) < 1;

  const byHolder = HOLDER_ORDER.map((h) => {
    const acc = holderAccounts[h];
    if (!ctx.trades.some((t) => acc.includes(t.account))) return null;
    const start = inceptionStart(ctx, acc);
    const sym = symbolsForFilter(ctx, acc, q.oc);
    return { h, r: runPeriod(ctx, { start, end: ctx.asof }, { accounts: acc, benchmarks: [INDIA_BENCHMARK], symbols: sym }) };
  }).filter((x): x is { h: HolderKey; r: ReturnType<typeof runPeriod> } => x != null);

  const cell = (r: typeof main, isBench: boolean) => {
    const h = headline(isBench ? r.bench[INDIA_BENCHMARK] : r.pf, r);
    return h.value == null ? <span className="text-slate-400">n/a</span> : fmtPct(h.value);
  };

  const pf = headline(main.pf, main);
  const kind = pf.kind === "IRR" ? "IRR" : "Return";
  const bh = headline(main.bench[INDIA_BENCHMARK], main);
  const a = alpha(main.pf, main.bench[INDIA_BENCHMARK], main);
  const invested = main.net - main.V0;

  return (
    <div className="flex flex-col gap-5">
      <RollupSubNav />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <HolderToggle base={BASE} q={q} />
          <OpenClosedToggle base={BASE} q={q} />
        </div>
        <PeriodBar base={BASE} q={q} defs={defs} current={period.key} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Blended value" value={fmtMoney(main.V1, CUR)} sub={fmtDay(main.d1)} />
        <Tile label={`Blended ${kind}`} dot={CATEGORICAL[0]} value={fmtPct(pf.value)} valueClass={tone(pf.value)} sub={`P&L ${fmtMoney(main.pf.profit, CUR)}${main.annualised ? "" : " · period return, under 90 days"}`} />
        <Tile label={`${BENCHMARK_LABEL} ${kind}`} dot={CATEGORICAL[1]} value={fmtPct(bh.value)} sub={`same flows · P&L ${fmtMoney(main.bench[INDIA_BENCHMARK].profit, CUR)}`} />
        <Tile label={`Alpha vs ${BENCHMARK_LABEL}`} value={fmtPP(a)} valueClass={tone(a)} sub={`${fmtMoney(main.pf.profit - main.bench[INDIA_BENCHMARK].profit, CUR)} vs index P&L`} />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{period.label}: blended value vs identical flows in {BENCHMARK_LABEL}</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(main.d0)} → {fmtDay(main.d1)} · {Math.round(main.days)} days · net invested in period {fmtMoney(invested, CUR)}
          </span>
        </div>
        <RollupValueChart data={downsample(main.series ?? [])} benchmark={INDIA_BENCHMARK} benchmarkLabel={BENCHMARK_LABEL} />
        <Note>
          Replica = every rupee invested or withdrawn, on the same dates, put into {BENCHMARK_LABEL} instead. IRR is money-weighted (XIRR).
          Periods under 90 days show the period return, not an annualised figure.
          {q.oc !== "ALL" && ` Filtered to ${OC_LABEL[q.oc].toLowerCase()} positions.`}
        </Note>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By channel · {period.label}</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Channel</Th><Th>{kind}</Th><Th>P&amp;L</Th><Th>Value</Th></tr>
          </thead>
          <tbody>
            {byChannel.map(({ ch, chHasTrades, r }) => (
              <tr key={ch} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">
                  {CHANNEL_HREF[ch] ? (
                    <a href={CHANNEL_HREF[ch]} className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600">
                      {CHANNEL_LABEL[ch]}
                    </a>
                  ) : (
                    CHANNEL_LABEL[ch]
                  )}
                  {!chHasTrades && <span className="ml-2"><Badge tone="amber">no trade history</Badge></span>}
                </Td>
                <Td className={tone(headline(r.pf, r).value)}>{r.hasData ? cell(r, false) : "–"}</Td>
                <Td className={tone(r.pf.profit)}>{r.hasData ? fmtMoney(r.pf.profit, CUR) : "–"}</Td>
                <Td>{r.hasData ? fmtMoney(r.V1, CUR) : "–"}</Td>
              </tr>
            ))}
            <tr className="border-t border-slate-200 font-semibold">
              <Td right={false}>Blended total</Td>
              <Td className={tone(pf.value)}>{cell(main, false)}</Td>
              <Td className={tone(main.pf.profit)}>{fmtMoney(main.pf.profit, CUR)}</Td>
              <Td>{fmtMoney(main.V1, CUR)}</Td>
            </tr>
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>
            {reconciled
              ? "Channel P&L and value sum exactly to the blended total. IRR itself isn't additive across channels — each channel's IRR is its own money-weighted rate, not a decomposition of the blended rate."
              : `Channel sums (P&L ${fmtMoney(channelProfitSum, CUR)}, value ${fmtMoney(channelV1Sum, CUR)}) don't match the blended total — check channel/account membership.`}
          </Note>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By holder · since first trade</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Scope</Th><Th>IRR</Th><Th>P&amp;L</Th><Th>Value</Th></tr>
          </thead>
          <tbody>
            {byHolder.map(({ h, r }) => (
              <tr key={h} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">
                  {HOLDER_LABEL[h]}
                  <div className="text-xs font-normal text-slate-400">since {fmtDay(r.d0)}</div>
                </Td>
                <Td className={tone(r.pf.irr)}>{cell(r, false)}</Td>
                <Td className={tone(r.pf.profit)}>{fmtMoney(r.pf.profit, CUR)}</Td>
                <Td>{fmtMoney(r.V1, CUR)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">All periods</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Period</Th><Th>Blended</Th><Th>{BENCHMARK_LABEL}</Th><Th>Alpha</Th><Th>P&amp;L</Th><Th>End value</Th></tr>
          </thead>
          <tbody>
            {table.map(({ d, r }) => {
              const al = alpha(r.pf, r.bench[INDIA_BENCHMARK], r);
              return (
                <tr key={d.key} className={`${rowCls} ${d.key === period.key ? "bg-slate-50" : ""}`}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{d.label}</span>{" "}
                    {r.days < 364 && <Badge tone={r.annualised ? "slate" : "amber"}>{r.annualised ? "<1Y" : "return, <90d"}</Badge>}
                    <div className="text-xs text-slate-400">{fmtDay(r.d0)} → {fmtDay(r.d1)}</div>
                  </Td>
                  <Td className={tone(headline(r.pf, r).value)}>{cell(r, false)}</Td>
                  <Td>{cell(r, true)}</Td>
                  <Td className={tone(al)}>{fmtPP(al)}</Td>
                  <Td className={tone(r.pf.profit)}>{fmtMoney(r.pf.profit, CUR)}</Td>
                  <Td>{fmtMoney(r.V1, CUR)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>Periods under one year are shown but not comparable with annual figures; under 90 days the period return replaces the annualised IRR.</Note>
        </div>
      </Card>
    </div>
  );
}
