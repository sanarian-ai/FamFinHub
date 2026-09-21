import { Card, EmptyState } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio/data";
import { fmtDay, fmtINR, fmtMoney, fmtPct, fmtPP, fmtUSD, tone, type Cur } from "@/lib/portfolio/format";
import { alpha, decompose, downsample, headline, pickPeriod, periodDefs, positions, runPeriod } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { PeriodBar, Toggles, parseQ } from "./controls";
import { HealthStrip, Note, Tile } from "./ui";
import { ValueChart } from "./ValueChart";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, book, health, empty } = await getPortfolioData();
  if (empty) return <EmptyState>No portfolio data yet. Run the seed script or wait for the first sync.</EmptyState>;

  const cur = q.cur as Cur;
  const period = pickPeriod(ctx, q.p);
  const opts = { dividends: q.div === "1" };
  const r = runPeriod(ctx, period, { ...opts, currency: cur, series: true });
  const other = runPeriod(ctx, period, { ...opts, currency: cur === "USD" ? "INR" : "USD" });
  const usd = cur === "USD" ? r : other, inr = cur === "INR" ? r : other;
  const dec = decompose(ctx, period, opts);
  const pos = positions(ctx, book);

  const pf = headline(r.pf, r), spy = headline(r.SPY, r), qqq = headline(r.QQQ, r);
  const kind = pf.kind === "IRR" ? "IRR" : "Return";
  const aSpy = alpha(r.pf, r.SPY, r), aQqq = alpha(r.pf, r.QQQ, r);
  const invested = r.net - r.V0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <HealthStrip h={health} />
          <Toggles base="/portfolio/us" q={q} showDividends />
        </div>
        <PeriodBar base="/portfolio/us" q={q} defs={periodDefs(ctx)} current={period.key} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Portfolio value" value={fmtMoney(r.V1, cur)} sub={`${fmtMoney(other.V1, cur === "USD" ? "INR" : "USD")} · ${fmtDay(r.d1)}`} />
        <Tile label={`Portfolio ${kind}`} dot={CATEGORICAL[0]} value={fmtPct(pf.value)} valueClass={tone(pf.value)} sub={`P&L ${fmtMoney(r.pf.profit, cur)}${r.annualised ? "" : " · period return, under 90 days"}`} />
        <Tile label={`S&P 500 ${kind}`} dot={CATEGORICAL[1]} value={fmtPct(spy.value)} sub={`same flows · P&L ${fmtMoney(r.SPY.profit, cur)}`} />
        <Tile label={`Nasdaq-100 ${kind}`} dot={CATEGORICAL[2]} value={fmtPct(qqq.value)} sub={`same flows · P&L ${fmtMoney(r.QQQ.profit, cur)}`} />
        <Tile label="Alpha vs SPY" value={fmtPP(aSpy)} valueClass={tone(aSpy)} sub={`${fmtMoney(r.pf.profit - r.SPY.profit, cur)} vs index P&L`} />
        <Tile label="Alpha vs QQQ" value={fmtPP(aQqq)} valueClass={tone(aQqq)} sub={`${fmtMoney(r.pf.profit - r.QQQ.profit, cur)} vs index P&L`} />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">Value vs identical flows in the indices</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(r.d0)} → {fmtDay(r.d1)} · {Math.round(r.days)} days · net invested in period {fmtMoney(invested, cur)}
          </span>
        </div>
        <ValueChart data={downsample(r.series ?? [])} cur={cur} />
        <Note>
          Replica = every dollar you invested or withdrew, on the same dates, put into the index instead. IRR is money-weighted (XIRR). Periods under 90 days show the period return, not an annualised figure.
        </Note>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Where the INR gain came from</h2>
          <table className="w-full text-sm">
            <tbody>
              {[
                ["Price gains (USD, at closing FX)", dec.price],
                ["Dividends (est., after 25% WHT)", dec.dividends],
                ["Currency (USD/INR moves on invested capital)", dec.fx],
              ].map(([l, v]) => (
                <tr key={l as string} className="border-b border-slate-100">
                  <td className="py-2 text-slate-600">{l}</td>
                  <td className={`py-2 text-right tabular-nums ${tone(v as number)}`}>{fmtINR(v as number)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 font-semibold text-slate-900">Total INR gain</td>
                <td className={`py-2 text-right font-semibold tabular-nums ${tone(dec.total)}`}>{fmtINR(dec.total)}</td>
              </tr>
            </tbody>
          </table>
          <div className="mt-3 text-xs text-slate-500">
            USD/INR {dec.fxRateStart.toFixed(2)} → {dec.fxRateEnd.toFixed(2)} ({fmtPct(dec.fxRateEnd / dec.fxRateStart - 1, 1, true)}). INR IRR {fmtPct(inr.pf.irr)} vs USD IRR {fmtPct(usd.pf.irr)}
            {r.annualised ? "" : " (period return shown on the tiles)"}.
            {opts.dividends ? "" : " Dividends are excluded; switch on “Est. dividends” to include them."}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Concentration</h2>
          <div className="flex flex-col gap-2">
            {pos.rows.slice(0, 6).map((p, i) => (
              <div key={p.symbol} className="flex items-center gap-3 text-sm">
                <span className="w-14 font-medium text-slate-800">{p.symbol}</span>
                <div className="h-2.5 flex-1 rounded-full bg-slate-100">
                  <div className="h-2.5 rounded-full" style={{ width: `${Math.max(1, p.weight * 100)}%`, background: CATEGORICAL[i % CATEGORICAL.length] }} />
                </div>
                <span className="w-14 text-right tabular-nums text-slate-700">{fmtPct(p.weight)}</span>
                <span className="w-24 text-right tabular-nums text-slate-500">{fmtUSD(p.value)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 text-xs text-slate-500">
            Top 3 = {fmtPct(pos.rows.slice(0, 3).reduce((a, p) => a + p.weight, 0))} of {fmtUSD(pos.totalValue)} at current prices. A 30% fall in those three is {fmtUSD(-0.3 * pos.rows.slice(0, 3).reduce((a, p) => a + p.value, 0))}.
          </div>
        </Card>
      </div>
    </div>
  );
}
