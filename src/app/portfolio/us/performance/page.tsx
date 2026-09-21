import { Badge, Card, EmptyState } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio/data";
import { inceptionStart } from "@/lib/portfolio/engine";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone, type Cur } from "@/lib/portfolio/format";
import { accountsFor, alpha, BROKERS, downsample, headline, pickPeriod, periodDefs, runPeriod, stockRows, type BrokerKey } from "@/lib/portfolio/views";
import { PeriodBar, Toggles, parseQ } from "../controls";
import { Note, rowCls, tableCls, Td, Th, theadCls } from "../ui";
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

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Toggles base={BASE} q={q} showBroker showDividends />
        <PeriodBar base={BASE} q={q} defs={defs} current={period.key} />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{period.label}: value vs replicas</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(main.d0)} → {fmtDay(main.d1)} · {main.annualised ? "IRR" : "period return"} {fmtPct(headline(main.pf, main).value)} vs SPY {fmtPct(headline(main.SPY, main).value)} · QQQ {fmtPct(headline(main.QQQ, main).value)}
          </span>
        </div>
        <ValueChart data={downsample(main.series ?? [])} cur={cur} />
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
                <Td className={tone(usd.pf.profit)}>{fmtMoney(usd.pf.profit, "USD")}</Td>
                <Td>{fmtMoney(usd.V1, "USD")}</Td>
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
