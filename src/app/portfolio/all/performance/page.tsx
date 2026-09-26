import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getPortfolioData } from "@/lib/portfolio/data";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { getCryptoPortfolioData } from "@/lib/portfolio/crypto-data";
import { inceptionStart, type SeriesPt } from "@/lib/portfolio/engine";
import { combinedRun, COMBINED_INDIA_BENCHMARK } from "@/lib/portfolio/combined";
import { alpha, downsample, headline, periodDefs } from "@/lib/portfolio/views";
import { fmtDay, fmtMoney, fmtPct, fmtPP, tone } from "@/lib/portfolio/format";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { PeriodBar } from "../../india/rollupControls";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "../../india/ui";
import { AllSubNav } from "../AllSubNav";
import { ValueChart } from "../ValueChart";
import { BENCHMARK_LABEL } from "../constants";

export const dynamic = "force-dynamic";
const CUR = "INR" as const;
const BASE = "/portfolio/all/performance";
const ALL_BENCH = ["NIFTY50TRI", "SPY", "QQQ"] as const;

/**
 * /portfolio/all's Performance tab — the household combined IRR (build-order step 6). India
 * [blended] and US Stocks IRR side by side, plus one All Assets row that FX-normalizes the US book
 * to INR and merges both books' cash-flow streams into a single xirr() call (see combined.ts's
 * header for why this needs no changes to the core engine). Benchmark alpha vs each of the 3 locked
 * indices (Nifty 50 TRI / S&P 500 / QQQ) reuses each book's OWN already-computed single-book replica
 * — same "channel cut" pattern as the India rollup's by-channel table: P&L/value sum exactly to the
 * total, IRR does not (it's money-weighted per scope, not additive). Real estate has no engine-backed
 * IRR at all and stays off this page entirely — see Overview. Crypto (BTC + ETH) joined as a 3rd book
 * on 2026-09-26 (see combined.ts's cryptoCtx param): it folds into every All Assets total (value,
 * P&L, the merged IRR) and gets its own row in "By book" below, but its own alpha vs Nifty 50 TRI
 * stays on its own Performance tab rather than being blended into the locked India-vs-Nifty /
 * US-vs-SPY-QQQ alpha tiles here — those three indices were a locked decision before crypto existed,
 * and quietly redefining what "Alpha vs Nifty 50 TRI" means on this page felt riskier than just
 * pointing there.
 *
 * Household-level only: the US book has no per-holder account scoping (unlike the India rollup's
 * Household/Sangeeth/Ria toggle), so this page doesn't offer one either.
 */
export default async function AllPerformance({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const pKey = typeof sp.p === "string" ? sp.p : undefined;

  const [usData, indiaData, cryptoData] = await Promise.all([getPortfolioData(), getIndiaPortfolioData(), getCryptoPortfolioData()]);
  const { ctx: usCtx, empty: usEmpty } = usData;
  const { ctx: indiaCtx, channelAccounts, empty: indiaEmpty } = indiaData;
  const indiaAll = channelAccounts.ALL;
  const indiaHasTrades = indiaCtx.trades.some((t) => indiaAll.includes(t.account));
  // Crypto is optional/best-effort here, unlike US and India above: if it's ever empty (e.g. a
  // future reset before a re-seed), the page still renders the US+India combined view rather than
  // blocking on a 3rd book that didn't exist when this page was first built.
  const cryptoCtx = cryptoData.empty ? undefined : cryptoData.ctx;

  if (usEmpty || indiaEmpty || !indiaHasTrades) {
    return <EmptyState>Combined performance needs dated trade history in both the US and India books.</EmptyState>;
  }

  const usInception = inceptionStart(usCtx);
  const indiaInception = inceptionStart(indiaCtx, indiaAll);
  const spineIsIndia = indiaInception <= usInception;
  const defs = periodDefs(spineIsIndia ? indiaCtx : usCtx, spineIsIndia ? indiaAll : undefined);
  const period = defs.find((d) => d.key === pKey) ?? defs.find((d) => d.key === "SI")!;

  const main = combinedRun(usCtx, indiaCtx, indiaAll, period.start, period.end, { series: true, cryptoCtx });
  const table = defs
    .map((d) => ({ d, r: combinedRun(usCtx, indiaCtx, indiaAll, d.start, d.end, { cryptoCtx }) }))
    .filter((x) => x.r.hasData);

  const kind = main.annualised ? "IRR" : "Return";
  const pf = headline(main.all, main);
  const niftyLeg = main.india.bench[COMBINED_INDIA_BENCHMARK];
  const spLeg = main.us.SPY, qqqLeg = main.us.QQQ;
  const niftyH = headline(niftyLeg, main), spH = headline(spLeg, main), qqqH = headline(qqqLeg, main);
  const alphaNifty = alpha(main.all, niftyLeg, main);
  const alphaSP = alpha(main.all, spLeg, main);
  const alphaQQQ = alpha(main.all, qqqLeg, main);

  // Merged value-vs-benchmark series: both run() calls inside combinedRun() were given the same
  // start/end and identical Ctx.dates arrays (see combined.ts's header comment), so the US and India
  // series are index-aligned date-for-date — no need to re-key by date string.
  const mergedSeries: SeriesPt[] = (main.us.series ?? []).map((u, i) => {
    const ind = main.india.series?.[i];
    const cr = main.crypto?.series?.[i];
    const bench = { [COMBINED_INDIA_BENCHMARK]: ind?.bench[COMBINED_INDIA_BENCHMARK] ?? 0, SPY: u.bench.SPY ?? 0, QQQ: u.bench.QQQ ?? 0 };
    return { d: u.d, pf: u.pf + (ind?.pf ?? 0) + (cr?.pf ?? 0), inv: u.inv + (ind?.inv ?? 0) + (cr?.inv ?? 0), SPY: bench.SPY, QQQ: bench.QQQ, bench };
  });

  const bookRows = [
    { key: "us", label: "US Stocks", href: "/portfolio/us/performance", r: main.us },
    { key: "india", label: "India (blended)", href: "/portfolio/india/performance", r: main.india },
    ...(main.crypto ? [{ key: "crypto", label: "Crypto", href: "/portfolio/crypto/performance", r: main.crypto }] : []),
  ];
  const bookProfitSum = main.us.pf.profit + main.india.pf.profit + (main.crypto?.pf.profit ?? 0);
  const bookV1Sum = main.us.V1 + main.india.V1 + (main.crypto?.V1 ?? 0);
  const reconciled = Math.abs(bookProfitSum - main.all.profit) < 1 && Math.abs(bookV1Sum - main.V1) < 1;

  return (
    <div className="flex flex-col gap-5">
      <AllSubNav />

      <PeriodBar base={BASE} q={{ p: pKey }} defs={defs} current={period.key} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile label="All Assets value" value={fmtMoney(main.V1, CUR)} sub={fmtDay(main.d1)} />
        <Tile
          label={`All Assets ${kind}`}
          dot={CATEGORICAL[0]}
          value={pf.value == null ? "n/a" : fmtPct(pf.value)}
          valueClass={tone(pf.value)}
          sub={`P&L ${fmtMoney(main.all.profit, CUR)}${main.annualised ? "" : " · period return, under 90 days"}`}
        />
        <Tile
          label={`${BENCHMARK_LABEL.NIFTY50TRI} ${kind}`}
          dot={CATEGORICAL[1]}
          value={niftyH.value == null ? "n/a" : fmtPct(niftyH.value)}
          sub={<>India&apos;s flows replicated · <span className={tone(alphaNifty)}>α {fmtPP(alphaNifty)}</span></>}
        />
        <Tile
          label={`${BENCHMARK_LABEL.SPY} ${kind}`}
          dot={CATEGORICAL[2]}
          value={spH.value == null ? "n/a" : fmtPct(spH.value)}
          sub={<>US flows replicated · <span className={tone(alphaSP)}>α {fmtPP(alphaSP)}</span></>}
        />
        <Tile
          label={`${BENCHMARK_LABEL.QQQ} ${kind}`}
          dot={CATEGORICAL[3]}
          value={qqqH.value == null ? "n/a" : fmtPct(qqqH.value)}
          sub={<>US flows replicated · <span className={tone(alphaQQQ)}>α {fmtPP(alphaQQQ)}</span></>}
        />
      </div>

      <Card>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">{period.label}: All Assets value vs each book&apos;s own benchmark replica</h2>
          <span className="text-xs text-slate-500">
            {fmtDay(main.d0)} → {fmtDay(main.d1)} · {Math.round(main.days)} days
          </span>
        </div>
        <ValueChart data={downsample(mergedSeries)} benchmarks={ALL_BENCH} />
        <Note>
          Replica lines are each book&apos;s own benchmark replica (India&apos;s flows into {BENCHMARK_LABEL.NIFTY50TRI}, US&apos;s flows into{" "}
          {BENCHMARK_LABEL.SPY}/{BENCHMARK_LABEL.QQQ}) — not a single merged replica of the whole household&apos;s flows into each index. All
          Assets IRR is money-weighted (XIRR) over the FX-normalized, merged cash-flow stream of both books. Periods under 90 days show the
          period return, not an annualised figure.
        </Note>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">By book · {period.label}</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Book</Th><Th>{kind}</Th><Th>P&amp;L</Th><Th>Value</Th></tr>
          </thead>
          <tbody>
            {bookRows.map(({ key, label, href, r }) => {
              const h = headline(r.pf, r);
              return (
                <tr key={key} className={rowCls}>
                  <Td right={false} className="font-medium text-slate-800">
                    <Link href={href} className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600">
                      {label}
                    </Link>
                  </Td>
                  <Td className={tone(h.value)}>{r.hasData ? (h.value == null ? <span className="text-slate-400">n/a</span> : fmtPct(h.value)) : "–"}</Td>
                  <Td className={tone(r.pf.profit)}>{r.hasData ? fmtMoney(r.pf.profit, CUR) : "–"}</Td>
                  <Td>{r.hasData ? fmtMoney(r.V1, CUR) : "–"}</Td>
                </tr>
              );
            })}
            <tr className="border-t border-slate-200 font-semibold">
              <Td right={false}>All Assets</Td>
              <Td className={tone(pf.value)}>{pf.value == null ? "n/a" : fmtPct(pf.value)}</Td>
              <Td className={tone(main.all.profit)}>{fmtMoney(main.all.profit, CUR)}</Td>
              <Td>{fmtMoney(main.V1, CUR)}</Td>
            </tr>
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>
            {reconciled
              ? "Book P&L and value sum exactly to the All Assets total. IRR itself isn't additive — the combined IRR is its own money-weighted rate over the merged cash-flow stream, not a blend of the books' rates."
              : `Book sums (P&L ${fmtMoney(bookProfitSum, CUR)}, value ${fmtMoney(bookV1Sum, CUR)}) don't match the All Assets total — check account scoping.`}{" "}
            Real estate is value-only and excluded from this page entirely — see Overview. Crypto&apos;s own alpha vs Nifty 50 TRI is on its{" "}
            <Link href="/portfolio/crypto/performance" className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-600">
              own Performance tab
            </Link>{" "}
            rather than blended into the tiles above.
          </Note>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">All periods</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <Th right={false}>Period</Th><Th>All Assets</Th><Th>{BENCHMARK_LABEL.NIFTY50TRI}</Th><Th>{BENCHMARK_LABEL.SPY}</Th>
              <Th>{BENCHMARK_LABEL.QQQ}</Th><Th>P&amp;L</Th><Th>End value</Th>
            </tr>
          </thead>
          <tbody>
            {table.map(({ d, r }) => {
              const h = headline(r.all, r);
              const niftyH = headline(r.india.bench[COMBINED_INDIA_BENCHMARK], r);
              const spH = headline(r.us.SPY, r);
              const qqqH = headline(r.us.QQQ, r);
              return (
                <tr key={d.key} className={`${rowCls} ${d.key === period.key ? "bg-slate-50" : ""}`}>
                  <Td right={false}>
                    <span className="font-medium text-slate-800">{d.label}</span>{" "}
                    {r.days < 364 && <Badge tone={r.annualised ? "slate" : "amber"}>{r.annualised ? "<1Y" : "return, <90d"}</Badge>}
                    <div className="text-xs text-slate-400">{fmtDay(r.d0)} → {fmtDay(r.d1)}</div>
                  </Td>
                  <Td className={tone(h.value)}>{h.value == null ? "n/a" : fmtPct(h.value)}</Td>
                  <Td>{niftyH.value == null ? "n/a" : fmtPct(niftyH.value)}</Td>
                  <Td>{spH.value == null ? "n/a" : fmtPct(spH.value)}</Td>
                  <Td>{qqqH.value == null ? "n/a" : fmtPct(qqqH.value)}</Td>
                  <Td className={tone(r.all.profit)}>{fmtMoney(r.all.profit, CUR)}</Td>
                  <Td>{fmtMoney(r.V1, CUR)}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2">
          <Note>
            Periods under one year are shown but not comparable with annual figures; under 90 days the period return replaces the annualised
            IRR. Household-level only — the US book has no per-holder account scoping, so there&apos;s no holder toggle here (unlike the India
            rollup).
          </Note>
        </div>
      </Card>
    </div>
  );
}
