import { Badge, Card, EmptyState } from "@/components/ui";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { inceptionStart } from "@/lib/portfolio/engine";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone } from "@/lib/portfolio/format";
import { alpha, downsample, headline, pickPeriod, periodDefs, runPeriod, stockRows } from "@/lib/portfolio/views";
import { HolderToggle, PeriodBar, parseQ } from "../controls";
import { Note, rowCls, tableCls, Td, Th, theadCls } from "../../ui";
import { ValueChart } from "../ValueChart";
import { accountsForHolder, EQUITY_BENCHMARKS, BENCHMARK_LABEL, EQUITY_HOLDER_GROUPS, type HolderKey } from "../constants";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/india/equity/performance";
const CUR = "INR" as const;
const [B0, B1] = EQUITY_BENCHMARKS;

export default async function IndiaEquityPerformance({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, channelAccounts } = await getIndiaPortfolioData();
  const accounts: string[] = q.h === "ALL" ? channelAccounts.EQUITY : (accountsForHolder(q.h) ?? channelAccounts.EQUITY);
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) return <EmptyState>No dated trade history yet for India Equity.</EmptyState>;

  const opts = { accounts, benchmarks: EQUITY_BENCHMARKS };
  const defs = periodDefs(ctx, accounts);
  const period = pickPeriod(ctx, q.p, accounts);
  const main = runPeriod(ctx, period, { ...opts, series: true });

  const table = defs.map((d) => ({ d, r: runPeriod(ctx, d, opts) })).filter((x) => x.r.hasData);
  const stocks = stockRows(ctx, period, opts);
  const byHolder = (Object.keys(EQUITY_HOLDER_GROUPS) as HolderKey[]).map((h) => {
    const acc = h === "ALL" ? channelAccounts.EQUITY : (accountsForHolder(h) ?? channelAccounts.EQUITY);
    if (!ctx.trades.some((t) => acc.includes(t.account))) return null;
    const start = inceptionStart(ctx, acc);
    return { h, r: runPeriod(ctx, { start, end: ctx.asof }, { accounts: acc, benchmarks: EQUITY_BENCHMARKS }) };
  }).filter((x): x is { h: HolderKey; r: ReturnType<typeof runPeriod> } => x != null);

  const cell = (r: typeof main, key: string) => {
    const h = headline(r.bench[key] ?? r.pf, r);
    if (key === "pf") { const hh = headline(r.pf, r); return hh.value == null ? <span className="text-slate-400">n/a</span> : fmtPct(hh.value); }
    return h.value == null ? <span className="text-slate-400" title="No annualised rate (replica net short or no flows)">n/a</span> : fmtPct(h.value);
  };
  const HOLDER_LABEL: Record<HolderKey, string> = { ALL: "Both holders", SANGEETH: "Sangeeth (Zerodha)", RIA: "Ria (Kotak + IIFL)" };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <HolderToggle base={BASE} q={q} />
        <PeriodBar base={BASE} q={q} defs={defs} current={period.key} />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{period.label}: value vs replicas</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(main.d0)} → {fmtDay(main.d1)} · {main.annualised ? "IRR" : "period return"} {fmtPct(headline(main.pf, main).value)} vs {BENCHMARK_LABEL[B0]} {fmtPct(headline(main.bench[B0], main).value)} · {BENCHMARK_LABEL[B1]} {fmtPct(headline(main.bench[B1], main).value)}
          </span>
        </div>
        <ValueChart data={downsample(main.series ?? [])} benchmarks={EQUITY_BENCHMARKS} />
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">All periods</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <Th right={false}>Period</Th><Th>Portfolio</Th><Th>{BENCHMARK_LABEL[B0]}</Th><Th>{BENCHMARK_LABEL[B1]}</Th><Th>α vs {B0}</Th><Th>α vs {B1}</Th><Th>P&amp;L</Th><Th>End value</Th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ d, r }) => {
              const a1 = alpha(r.pf, r.bench[B0], r), a2 = alpha(r.pf, r.bench[B1], r);
              return (
                <tr key={d.key} className={`${rowCls} ${d.key === period.key ? "bg-slate-50" : ""}`}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{d.label}</span>{" "}
                    {r.days < 364 && <Badge tone={r.annualised ? "slate" : "amber"}>{r.annualised ? "<1Y" : "return, <90d"}</Badge>}
                    <div className="text-xs text-slate-400">{fmtDay(r.d0)} → {fmtDay(r.d1)}</div>
                  </Td>
                  <Td className={tone(headline(r.pf, r).value)}>{cell(r, "pf")}</Td>
                  <Td>{cell(r, B0)}</Td>
                  <Td>{cell(r, B1)}</Td>
                  <Td className={tone(a1)}>{fmtPP(a1)}</Td>
                  <Td className={tone(a2)}>{fmtPP(a2)}</Td>
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

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By holder · since first trade</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Scope</Th><Th>IRR</Th><Th>{BENCHMARK_LABEL[B0]}</Th><Th>{BENCHMARK_LABEL[B1]}</Th><Th>P&amp;L</Th><Th>Value</Th></tr>
          </thead>
          <tbody>
            {byHolder.map(({ h, r }) => (
              <tr key={h} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">
                  {HOLDER_LABEL[h]}
                  <div className="text-xs font-normal text-slate-400">since {fmtDay(r.d0)}</div>
                </Td>
                <Td className={tone(r.pf.irr)}>{cell(r, "pf")}</Td>
                <Td>{cell(r, B0)}</Td>
                <Td>{cell(r, B1)}</Td>
                <Td className={tone(r.pf.profit)}>{fmtMoney(r.pf.profit, CUR)}</Td>
                <Td>{fmtMoney(r.V1, CUR)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By stock · {period.label}</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Stock</Th><Th>Return</Th><Th>Same flows in {BENCHMARK_LABEL[B0]}</Th><Th>α</Th><Th>P&amp;L</Th><Th>Multiple</Th><Th>End value</Th></tr>
          </thead>
          <tbody>
            {stocks.map((s) => {
              const h = headline(s.pf, s), hs = headline(s.bench[B0], s);
              const a = h.value != null && hs.value != null ? h.value - hs.value : null;
              return (
                <tr key={s.symbol} className={rowCls}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{s.symbol}</span>{" "}
                    {s.status === "exited" ? <Badge tone="slate">exited {fmtDay(s.d1)}</Badge> : null}
                    {!s.annualised && <Badge tone="amber">{Math.round(s.days)}d</Badge>}
                  </Td>
                  <Td className={tone(h.value)}>{h.value == null ? "n/a" : fmtPct(h.value)}</Td>
                  <Td>{hs.value == null ? "n/a" : fmtPct(hs.value)}</Td>
                  <Td className={tone(a)}>{fmtPP(a)}</Td>
                  <Td className={tone(s.profit)}>{fmtMoney(s.profit, CUR)}</Td>
                  <Td>{s.pf.moic == null ? "–" : `${s.pf.moic.toFixed(2)}x`}</Td>
                  <Td>{s.status === "exited" ? "–" : fmtMoney(s.V1, CUR)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>
            Return = annualised IRR when the holding period is 90 days or more, otherwise period return. Exited stocks are measured to their exit date. "n/a" means no rate exists, e.g. the index replica ends net short because you sold more than you bought at the time. Multiple = total cash back ÷ total cash in.
          </Note>
        </div>
      </Card>
    </div>
  );
}
