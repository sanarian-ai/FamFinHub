import { Card, EmptyState } from "@/components/ui";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone } from "@/lib/portfolio/format";
import { alpha, downsample, headline, pickPeriod, periodDefs, positions, runPeriod } from "@/lib/portfolio/views";
import { buildLots } from "@/lib/portfolio/engine";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { HolderToggle, PeriodBar, parseQ } from "./controls";
import { Note, Tile } from "../ui";
import { ValueChart } from "./ValueChart";
import { accountsForHolder, EQUITY_BENCHMARKS, BENCHMARK_LABEL } from "./constants";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/india/equity";
const CUR = "INR" as const;

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

  const period = pickPeriod(ctx, q.p, accounts);
  const opts = { accounts, benchmarks: EQUITY_BENCHMARKS };
  const r = runPeriod(ctx, period, { ...opts, series: true });
  // Lots are scoped to this holder's accounts here, not india-data.ts's blended book — that one
  // spans Equity+PMS+MF (see the combiner in india-data.ts), which would mix in PMS/MF positions.
  const pos = positions(ctx, buildLots(ds, accounts));

  const pf = headline(r.pf, r);
  const kind = pf.kind === "IRR" ? "IRR" : "Return";
  const bench = EQUITY_BENCHMARKS.map((b) => ({ key: b, label: BENCHMARK_LABEL[b], h: headline(r.bench[b], r), a: alpha(r.pf, r.bench[b], r) }));
  const invested = r.net - r.V0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">Prices to {fmtDay(ctx.asof)}</span>
          <HolderToggle base={BASE} q={q} />
        </div>
        <PeriodBar base={BASE} q={q} defs={periodDefs(ctx, accounts)} current={period.key} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Tile label="Portfolio value" value={fmtMoney(r.V1, CUR)} sub={fmtDay(r.d1)} />
        <Tile label={`Portfolio ${kind}`} dot={CATEGORICAL[0]} value={fmtPct(pf.value)} valueClass={tone(pf.value)} sub={`P&L ${fmtMoney(r.pf.profit, CUR)}${r.annualised ? "" : " · period return, under 90 days"}`} />
        <div />
        {bench.map((b, i) => (
          <Tile key={b.key} label={`${b.label} ${kind}`} dot={CATEGORICAL[(i + 1) % CATEGORICAL.length]} value={fmtPct(b.h.value)} sub={`same flows · P&L ${fmtMoney(r.bench[b.key].profit, CUR)}`} />
        ))}
        {bench.map((b) => (
          <Tile key={`a-${b.key}`} label={`Alpha vs ${b.label}`} value={fmtPP(b.a)} valueClass={tone(b.a)} sub={`${fmtMoney(r.pf.profit - r.bench[b.key].profit, CUR)} vs index P&L`} />
        ))}
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Value vs identical flows in the indices</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(r.d0)} → {fmtDay(r.d1)} · {Math.round(r.days)} days · net invested in period {fmtMoney(invested, CUR)}
          </span>
        </div>
        <ValueChart data={downsample(r.series ?? [])} benchmarks={EQUITY_BENCHMARKS} />
        <Note>
          Replica = every rupee you invested or withdrew, on the same dates, put into the index instead. IRR is money-weighted (XIRR). Periods under 90 days show the period return, not an annualised figure.
        </Note>
      </Card>

      <Card>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Concentration</h2>
        <div className="flex flex-col gap-2">
          {pos.rows.slice(0, 8).map((p, i) => (
            <div key={p.symbol} className="flex items-center gap-3 text-sm">
              <span className="w-20 font-medium text-slate-800">{p.symbol}</span>
              <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                <div className="h-2.5 rounded-full" style={{ width: `${Math.max(1, p.weight * 100)}%`, background: CATEGORICAL[i % CATEGORICAL.length] }} />
              </div>
              <span className="w-14 text-right tabular-nums text-slate-700">{fmtPct(p.weight)}</span>
              <span className="w-28 text-right tabular-nums text-slate-500">{fmtMoney(p.value, CUR)}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-xs text-slate-500">
          Top 3 = {fmtPct(pos.rows.slice(0, 3).reduce((a, p) => a + p.weight, 0))} of {fmtMoney(pos.totalValue, CUR)} at current prices. A 30% fall in those three is {fmtMoney(-0.3 * pos.rows.slice(0, 3).reduce((a, p) => a + p.value, 0), CUR)}.
        </div>
      </Card>
    </div>
  );
}
