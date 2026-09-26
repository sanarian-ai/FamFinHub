import { Badge, Card, EmptyState } from "@/components/ui";
import { getCryptoPortfolioData } from "@/lib/portfolio/crypto-data";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone } from "@/lib/portfolio/format";
import { alpha, downsample, headline, pickPeriod, periodDefs, runPeriod, stockRows } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { PeriodBar, parseQ } from "../controls";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile, fmtCrypto } from "../ui";
import { ValueChart } from "../ValueChart";
import { CRYPTO_BENCHMARKS, BENCHMARK_LABEL, SYMBOL_LABEL } from "../constants";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/crypto/performance";
const CUR = "INR" as const;
const [B0] = CRYPTO_BENCHMARKS;

export default async function CryptoPerformance({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, empty, lotsError } = await getCryptoPortfolioData();
  if (empty) return <EmptyState>No crypto holdings yet.</EmptyState>;
  if (lotsError) return <EmptyState>Lot-building failed: {lotsError}</EmptyState>;

  const opts = { benchmarks: CRYPTO_BENCHMARKS };
  const defs = periodDefs(ctx);
  const period = pickPeriod(ctx, q.p);
  const main = runPeriod(ctx, period, { ...opts, series: true });

  const table = defs.map((d) => ({ d, r: runPeriod(ctx, d, opts) })).filter((x) => x.r.hasData);
  const coins = stockRows(ctx, period, opts);

  const cell = (r: typeof main, key: string) => {
    if (key === "pf") { const hh = headline(r.pf, r); return hh.value == null ? <span className="text-slate-400">n/a</span> : fmtPct(hh.value); }
    const h = headline(r.bench[key] ?? r.pf, r);
    return h.value == null ? <span className="text-slate-400" title="No annualised rate (replica net short or no flows)">n/a</span> : fmtPct(h.value);
  };

  const pf = headline(main.pf, main);
  const kind = pf.kind === "IRR" ? "IRR" : "Return";
  const bench0 = { key: B0, label: BENCHMARK_LABEL[B0], h: headline(main.bench[B0], main), a: alpha(main.pf, main.bench[B0], main) };
  const invested = main.net - main.V0;

  return (
    <div className="flex flex-col gap-5">
      <PeriodBar base={BASE} q={q} defs={defs} current={period.key} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Portfolio value" value={fmtMoney(main.V1, CUR)} sub={fmtDay(main.d1)} />
        <Tile label={`Portfolio ${kind}`} dot={CATEGORICAL[0]} value={fmtPct(pf.value)} valueClass={tone(pf.value)} sub={`P&L ${fmtMoney(main.pf.profit, CUR)}${main.annualised ? "" : " · period return, under 90 days"}`} />
        <Tile label={`${bench0.label} ${kind}`} dot={CATEGORICAL[1]} value={fmtPct(bench0.h.value)} sub={`same flows · P&L ${fmtMoney(main.bench[B0].profit, CUR)}`} />
        <Tile label={`Alpha vs ${bench0.label}`} value={fmtPP(bench0.a)} valueClass={tone(bench0.a)} sub={`${fmtMoney(main.pf.profit - main.bench[B0].profit, CUR)} vs index P&L`} />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{period.label}: value vs identical flows in {bench0.label}</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(main.d0)} → {fmtDay(main.d1)} · {Math.round(main.days)} days · net invested in period {fmtMoney(invested, CUR)}
          </span>
        </div>
        <ValueChart data={downsample(main.series ?? [])} benchmarks={CRYPTO_BENCHMARKS} />
        <Note>
          Replica = every rupee you invested or withdrew, on the same dates, put into Nifty 50 TRI instead. IRR is money-weighted (XIRR). Periods under 90 days show the period return, not an annualised figure. 4 of the 8 CoinDCX trades (Jun–Jul 2025) predate CoinGecko's free 365-day history window and are priced at their own execution price until that date, so the chart steps rather than tracks daily moves before late 2025.
        </Note>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">All periods</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Period</Th><Th>Portfolio</Th><Th>{bench0.label}</Th><Th>Alpha</Th><Th>P&amp;L</Th><Th>End value</Th></tr>
          </thead>
          <tbody>
            {table.map(({ d, r }) => {
              const a1 = alpha(r.pf, r.bench[B0], r);
              return (
                <tr key={d.key} className={`${rowCls} ${d.key === period.key ? "bg-slate-50" : ""}`}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{d.label}</span>{" "}
                    {r.days < 364 && <Badge tone={r.annualised ? "slate" : "amber"}>{r.annualised ? "<1Y" : "return, <90d"}</Badge>}
                    <div className="text-xs text-slate-400">{fmtDay(r.d0)} → {fmtDay(r.d1)}</div>
                  </Td>
                  <Td className={tone(headline(r.pf, r).value)}>{cell(r, "pf")}</Td>
                  <Td>{cell(r, B0)}</Td>
                  <Td className={tone(a1)}>{fmtPP(a1)}</Td>
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
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By coin · {period.label}</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Coin</Th><Th>Return</Th><Th>Same flows in {bench0.label}</Th><Th>α</Th><Th>P&amp;L</Th><Th>Multiple</Th><Th>End value</Th></tr>
          </thead>
          <tbody>
            {coins.map((s) => {
              const h = headline(s.pf, s), hs = headline(s.bench[B0], s);
              const a = h.value != null && hs.value != null ? h.value - hs.value : null;
              return (
                <tr key={s.symbol} className={rowCls}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{s.symbol}</span>{" "}
                    <span className="font-normal text-slate-400">{SYMBOL_LABEL[s.symbol] ?? ""}</span>{" "}
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
            Return = annualised IRR when the holding period is 90 days or more, otherwise period return. "n/a" means no rate exists, e.g. the index replica ends net short. Multiple = total cash back ÷ total cash in.
          </Note>
        </div>
      </Card>
    </div>
  );
}
