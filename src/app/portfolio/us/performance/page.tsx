import { Badge, Card, EmptyState } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio/data";
import { inceptionStart } from "@/lib/portfolio/engine";
import { fmtDay, fmtINR, fmtMoney, fmtPct, fmtPP, fmtUSD, tone, type Cur } from "@/lib/portfolio/format";
import { accountsFor, alpha, BROKERS, decompose, downsample, headline, pickPeriod, periodDefs, runPeriod, stockRows, type BrokerKey } from "@/lib/portfolio/views";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { PeriodBar, Toggles, parseQ } from "../controls";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../ui";
import { ValueChart } from "../ValueChart";

export const dynamic = "force-dynamic";
const BASE = "/portfolio/us/performance";

export default async function Performance({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, empty } = await getPortfolioData();
  if (empty) return <EmptyState>No portfolio data yet.</EmptyState>;

  const cur = q.cur as Cur;
  const accounts = accountsFor(q.br as BrokerKey);
  const opts = { accounts, currency: cur, dividends: q.div === "1" };
  const defs = periodDefs(ctx, accounts);
  const period = pickPeriod(ctx, q.p, accounts);
  const main = runPeriod(ctx, period, { ...opts, series: true });
  const other = runPeriod(ctx, period, { ...opts, currency: cur === "USD" ? "INR" : "USD" });
  const usd = cur === "USD" ? main : other, inr = cur === "INR" ? main : other;
  const dec = decompose(ctx, period, opts);

  const table = defs.map((d) => ({ d, r: runPeriod(ctx, d, opts) })).filter((x) => x.r.hasData);
  const stocks = stockRows(ctx, period, opts);
  const byBroker = (Object.keys(BROKERS) as BrokerKey[]).map((b) => {
    const acc = accountsFor(b);
    const start = inceptionStart(ctx, acc);
    const o = { accounts: acc, dividends: q.div === "1" };
    return { b, usd: runPeriod(ctx, { start, end: ctx.asof }, { ...o, currency: "USD" }), inr: runPeriod(ctx, { start, end: ctx.asof }, { ...o, currency: "INR" }) };
  });

  const cell = (r: typeof main, leg: "pf" | "SPY" | "QQQ") => {
    const h = headline(r[leg], r);
    return h.value == null ? <span className="text-slate-400" title="No annualised rate (replica net short or no flows)">n/a</span> : fmtPct(h.value);
  };

  const pf = headline(main.pf, main), spy = headline(main.SPY, main), qqq = headline(main.QQQ, main);
  const kind = pf.kind === "IRR" ? "IRR" : "Return";
  const aSpy = alpha(main.pf, main.SPY, main), aQqq = alpha(main.pf, main.QQQ, main);
  const invested = main.net - main.V0;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Toggles base={BASE} q={q} showBroker showDividends />
        <PeriodBar base={BASE} q={q} defs={defs} current={period.key} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Portfolio value" value={fmtMoney(main.V1, cur)} sub={`${fmtMoney(other.V1, cur === "USD" ? "INR" : "USD")} · ${fmtDay(main.d1)}`} />
        <Tile label={`Portfolio ${kind}`} dot={CATEGORICAL[0]} value={fmtPct(pf.value)} valueClass={tone(pf.value)} sub={`P&L ${fmtMoney(main.pf.profit, cur)}${main.annualised ? "" : " · period return, under 90 days"}`} />
        <Tile
          label={`S&P 500 ${kind}`}
          dot={CATEGORICAL[1]}
          value={spy.value == null ? "n/a" : fmtPct(spy.value)}
          sub={<>same flows · <span className={tone(aSpy)}>α {fmtPP(aSpy)}</span></>}
        />
        <Tile
          label={`Nasdaq-100 ${kind}`}
          dot={CATEGORICAL[2]}
          value={qqq.value == null ? "n/a" : fmtPct(qqq.value)}
          sub={<>same flows · <span className={tone(aQqq)}>α {fmtPP(aQqq)}</span></>}
        />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{period.label}: value vs identical flows in the indices</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(main.d0)} → {fmtDay(main.d1)} · {Math.round(main.days)} days · net invested in period {fmtMoney(invested, cur)}
          </span>
        </div>
        <ValueChart data={downsample(main.series ?? [])} cur={cur} />
        <Note>
          Replica = every dollar you invested or withdrew, on the same dates, put into the index instead. IRR is money-weighted (XIRR). Periods under 90 days show the period return, not an annualised figure.
        </Note>
      </Card>

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
          {main.annualised ? "" : " (period return shown on the tiles)"}.
          {opts.dividends ? "" : " Dividends are excluded; switch on “Est. dividends” to include them."}
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">All periods</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <Th right={false}>Period</Th><Th>Portfolio</Th><Th>S&amp;P 500</Th><Th>Nasdaq-100</Th><Th>α vs SPY</Th><Th>α vs QQQ</Th><Th>P&amp;L</Th><Th>End value</Th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ d, r }) => {
              const a1 = alpha(r.pf, r.SPY, r), a2 = alpha(r.pf, r.QQQ, r);
              return (
                <tr key={d.key} className={`${rowCls} ${d.key === period.key ? "bg-slate-50" : ""}`}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{d.label}</span>{" "}
                    {r.days < 364 && <Badge tone={r.annualised ? "slate" : "amber"}>{r.annualised ? "<1Y" : "return, <90d"}</Badge>}
                    <div className="text-xs text-slate-400">{fmtDay(r.d0)} → {fmtDay(r.d1)}</div>
                  </Td>
                  <Td className={tone(headline(r.pf, r).value)}>{cell(r, "pf")}</Td>
                  <Td>{cell(r, "SPY")}</Td>
                  <Td>{cell(r, "QQQ")}</Td>
                  <Td className={tone(a1)}>{fmtPP(a1)}</Td>
                  <Td className={tone(a2)}>{fmtPP(a2)}</Td>
                  <Td className={tone(r.pf.profit)}>{fmtMoney(r.pf.profit, cur)}</Td>
                  <Td>{fmtMoney(r.V1, cur)}</Td>
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
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By broker · since first trade</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Scope</Th><Th>IRR (USD)</Th><Th>IRR (INR)</Th><Th>SPY (USD)</Th><Th>QQQ (USD)</Th><Th>P&amp;L (USD)</Th><Th>Value (USD)</Th></tr>
          </thead>
          <tbody>
            {byBroker.map(({ b, usd, inr }) => (
              <tr key={b} className={rowCls}>
                <Td right={false} className="font-medium text-slate-800">
                  {b === "ALL" ? "Both brokers" : b}
                  <div className="text-xs font-normal text-slate-400">since {fmtDay(usd.d0)}</div>
                </Td>
                <Td className={tone(usd.pf.irr)}>{cell(usd, "pf")}</Td>
                <Td className={tone(inr.pf.irr)}>{cell(inr, "pf")}</Td>
                <Td>{cell(usd, "SPY")}</Td>
                <Td>{cell(usd, "QQQ")}</Td>
                <Td className={tone(usd.pf.profit)}>{fmtUSD(usd.pf.profit)}</Td>
                <Td>{fmtUSD(usd.V1)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By stock · {period.label}</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Stock</Th><Th>Return</Th><Th>Same flows in SPY</Th><Th>α vs SPY</Th><Th>P&amp;L</Th><Th>Multiple</Th><Th>End value</Th></tr>
          </thead>
          <tbody>
            {stocks.map((s) => {
              const h = headline(s.pf, s), hs = headline(s.SPY, s);
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
                  <Td className={tone(s.profit)}>{fmtMoney(s.profit, cur)}</Td>
                  <Td>{s.pf.moic == null ? "–" : `${s.pf.moic.toFixed(2)}x`}</Td>
                  <Td>{s.status === "exited" ? "–" : fmtMoney(s.V1, cur)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>
            Return = annualised IRR when the holding period is 90 days or more, otherwise period return. Exited stocks are measured to their exit date. “n/a” means no rate exists, e.g. the index replica ends net short because you sold more than you bought at the time. Multiple = total cash back ÷ total cash in.
          </Note>
        </div>
      </Card>
    </div>
  );
}
