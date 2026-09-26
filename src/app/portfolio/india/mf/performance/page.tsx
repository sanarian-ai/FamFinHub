import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone } from "@/lib/portfolio/format";
import { alpha, downsample, headline, pickPeriod, periodDefs, runPeriod, stockRows } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { PeriodBar, parseQ } from "../controls";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../../ui";
import { ValueChart } from "../ValueChart";
import { MF_BENCHMARKS, BENCHMARK_LABEL } from "../constants";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/india/mf/performance";
const CUR = "INR" as const;

/** Blended across every MF_FOLIO account (all Ria's today), benchmarked against all four Nifty TRI
 * indices side by side — no per-scheme category classification, no composite, per the MF proposal's
 * locked decision. No holder or account toggle (single holder), unlike Equity/PMS. */
export default async function IndiaMfPerformance({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, channelAccounts } = await getIndiaPortfolioData();
  const accounts = channelAccounts.MF;
  const hasTrades = ctx.trades.some((t) => accounts.includes(t.account));
  if (!hasTrades) return <EmptyState>No mutual fund holdings yet — upload a CAMS Consolidated Account Statement to get started.</EmptyState>;

  const opts = { accounts, benchmarks: MF_BENCHMARKS };
  const defs = periodDefs(ctx, accounts);
  const period = pickPeriod(ctx, q.p, accounts);
  const main = runPeriod(ctx, period, { ...opts, series: true });

  const table = defs.map((d) => ({ d, r: runPeriod(ctx, d, opts) })).filter((x) => x.r.hasData);
  const schemes = stockRows(ctx, period, opts);

  const securities = await prisma.security.findMany({
    where: { transactions: { some: { account: { key: { in: accounts } } } } },
    select: { symbol: true, name: true },
  });
  const nameOf = new Map(securities.map((s) => [s.symbol, s.name]));

  const cell = (r: typeof main, key: string) => {
    if (key === "pf") { const hh = headline(r.pf, r); return hh.value == null ? <span className="text-slate-400">n/a</span> : fmtPct(hh.value); }
    const h = headline(r.bench[key] ?? r.pf, r);
    return h.value == null ? <span className="text-slate-400" title="No annualised rate (replica net short or no flows)">n/a</span> : fmtPct(h.value);
  };

  const pf = headline(main.pf, main);
  const kind = pf.kind === "IRR" ? "IRR" : "Return";
  const benchTiles = MF_BENCHMARKS.map((b, i) => ({ key: b, label: BENCHMARK_LABEL[b], h: headline(main.bench[b], main), a: alpha(main.pf, main.bench[b], main), dot: CATEGORICAL[(i + 1) % CATEGORICAL.length] }));
  const invested = main.net - main.V0;

  return (
    <div className="flex flex-col gap-5">
      <PeriodBar base={BASE} q={q} defs={defs} current={period.key} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Portfolio value" value={fmtMoney(main.V1, CUR)} sub={fmtDay(main.d1)} />
        <Tile label={`Portfolio ${kind}`} dot={CATEGORICAL[0]} value={fmtPct(pf.value)} valueClass={tone(pf.value)} sub={`P&L ${fmtMoney(main.pf.profit, CUR)}${main.annualised ? "" : " · period return, under 90 days"}`} />
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
          <h2 className="text-sm font-semibold text-slate-900">{period.label}: value vs identical flows in the indices</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(main.d0)} → {fmtDay(main.d1)} · {Math.round(main.days)} days · net invested in period {fmtMoney(invested, CUR)}
          </span>
        </div>
        <ValueChart data={downsample(main.series ?? [])} benchmarks={MF_BENCHMARKS} />
        <Note>
          Replica = every rupee you invested or withdrew, on the same dates, put into the index instead. IRR is money-weighted (XIRR). Periods under
          90 days show the period return, not an annualised figure.
        </Note>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">All periods</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <Th right={false}>Period</Th><Th>Portfolio</Th>
              {MF_BENCHMARKS.map((b) => <Th key={b}>{BENCHMARK_LABEL[b]}</Th>)}
              {MF_BENCHMARKS.map((b) => <Th key={`a-${b}`}>α vs {BENCHMARK_LABEL[b]}</Th>)}
              <Th>P&amp;L</Th><Th>End value</Th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ d, r }) => (
              <tr key={d.key} className={`${rowCls} ${d.key === period.key ? "bg-slate-50" : ""}`}>
                <Td right={false}>
                  <span className="font-medium text-slate-800">{d.label}</span>{" "}
                  {r.days < 364 && <Badge tone={r.annualised ? "slate" : "amber"}>{r.annualised ? "<1Y" : "return, <90d"}</Badge>}
                  <div className="text-xs text-slate-400">{fmtDay(r.d0)} → {fmtDay(r.d1)}</div>
                </Td>
                <Td className={tone(headline(r.pf, r).value)}>{cell(r, "pf")}</Td>
                {MF_BENCHMARKS.map((b) => <Td key={b}>{cell(r, b)}</Td>)}
                {MF_BENCHMARKS.map((b) => {
                  const a = alpha(r.pf, r.bench[b], r);
                  return <Td key={`a-${b}`} className={tone(a)}>{fmtPP(a)}</Td>;
                })}
                <Td className={tone(r.pf.profit)}>{fmtMoney(r.pf.profit, CUR)}</Td>
                <Td>{fmtMoney(r.V1, CUR)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>Periods under one year are shown but not comparable with annual figures; under 90 days the period return replaces the annualised IRR.</Note>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By scheme · {period.label}</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Scheme</Th><Th>Return</Th><Th>Same flows in {BENCHMARK_LABEL.NIFTY500TRI}</Th><Th>α</Th><Th>P&amp;L</Th><Th>Multiple</Th><Th>End value</Th></tr>
          </thead>
          <tbody>
            {schemes.map((s) => {
              const h = headline(s.pf, s), hs = headline(s.bench.NIFTY500TRI, s);
              const a = h.value != null && hs.value != null ? h.value - hs.value : null;
              return (
                <tr key={s.symbol} className={rowCls}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{nameOf.get(s.symbol) ?? s.symbol}</span>{" "}
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
            Return = annualised IRR when the holding period is 90 days or more, otherwise period return. Exited schemes are measured to their exit
            date. Benchmarked here against Nifty 500 TRI for a single reference column; the tiles above and the "All periods" table carry all four
            indices. "n/a" means no rate exists, e.g. the index replica ends net short because you redeemed more than you invested at the time.
            Multiple = total cash back ÷ total cash in.
          </Note>
        </div>
      </Card>
    </div>
  );
}
