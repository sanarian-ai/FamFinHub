import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtUnits, fmtUSD } from "@/lib/portfolio/format";
import { splitFactor } from "@/lib/portfolio/splits";
import { USD_BROKERS } from "@/lib/portfolio/load";
import { Note, rowCls, tableCls, Td, Th, theadCls } from "../ui";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LIMIT = 200;

export default async function Activity({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const br = s("br"), sym = s("sym"), side = s("side");

  // Scoped to the US book (USD_BROKERS — see load.ts) throughout this page: without this, the
  // default "All brokers" view and every list below (stock dropdown, corporate actions, sync
  // batches, review items) pulled from the WHOLE portfolio, not just US Stocks — CAMS mutual-fund
  // buys, Kabir PMS trades, IIFL demat trades, and every India-side data-quality flag all leaked
  // in under a broker label of "INDmoney". Found in the 2026-09-26 QA audit: the same failure mode
  // as the INR-leak incident (ccf7051), but that fix only covered the value/IRR engine path
  // (buildContext/run in load.ts), not this page's own separate Prisma queries.
  const usAccounts = await prisma.portfolioAccount.findMany({ where: { broker: { in: USD_BROKERS } }, select: { id: true, key: true } });
  const usAccountIds = usAccounts.map((a) => a.id);
  const [securities, actions, batches, reviews] = await Promise.all([
    prisma.security.findMany({ select: { id: true, symbol: true } }),
    prisma.corporateAction.findMany({ include: { security: { select: { symbol: true } } }, orderBy: { effectiveDate: "desc" } }),
    // "US-relevant" sync batches = the two US ingest sources (indmoney_report, ibkr_api); every
    // other PortfolioSource (cams_cas_pdf, kabir_pms_report, manual_closed_vehicle_audit,
    // iifl_trade_listing) is India-side and doesn't belong on this page.
    prisma.portfolioImportBatch.findMany({ where: { source: { in: ["indmoney_report", "ibkr_api"] } }, orderBy: { startedAt: "desc" }, take: 15 }),
    // UNITS_MISMATCH review items encode their account in refId as "<accountKey>|<symbol>" (see
    // ingest.ts's reconcile()) — scope to the US accounts' keys. OTHER-type items (batch-level
    // ingest rejections) carry no account/security reference at all, so there's no way to
    // attribute them to a book; as of this fix all 55 open review items are India-side units
    // mismatches or historical closed-vehicle ingest rejections, none US, so they're excluded here
    // rather than guessed at.
    prisma.portfolioReviewItem.findMany({
      where: { status: "open", type: "UNITS_MISMATCH", OR: usAccounts.map((a) => ({ refId: { startsWith: `${a.key}|` } })) },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const accKey = new Map(usAccounts.map((a) => [a.id, a.key]));
  const symOf = new Map(securities.map((x) => [x.id, x.symbol]));
  const where = {
    account: { id: { in: usAccountIds }, ...(br ? { key: br === "IBKR" ? "IBKR" : "INDMONEY_ALPACA" } : {}) },
    ...(sym ? { security: { symbol: sym } } : {}),
    ...(side === "BUY" || side === "SELL" ? { side: side as "BUY" | "SELL" } : {}),
  };
  const [total, trades, allTotal] = await Promise.all([
    prisma.portfolioTransaction.count({ where }),
    prisma.portfolioTransaction.findMany({ where, orderBy: [{ tradeDate: "desc" }, { execTs: "desc" }], take: LIMIT }),
    prisma.portfolioTransaction.count({ where: { account: { id: { in: usAccountIds } } } }),
  ]);
  if (allTotal === 0) return <EmptyState>No trades yet.</EmptyState>;
  // US-traded symbols only, for both the dropdown and the corporate-actions card below — not every
  // Security row in the DB (that included Indian MF ISINs, Kabir/Unifi tickers, NSE benchmark
  // indices, and the EPF/NPS placeholder rows).
  const usSymbols = new Set(
    (await prisma.portfolioTransaction.findMany({ where: { account: { id: { in: usAccountIds } } }, select: { securityId: true }, distinct: ["securityId"] }))
      .map((t) => symOf.get(t.securityId))
      .filter((s): s is string => !!s),
  );
  const usActions = actions.filter((a) => usSymbols.has(a.security.symbol));
  const acts = new Map<string, { effectiveDate: string; ratio: number }[]>();
  for (const a of usActions) {
    const k = a.security.symbol;
    acts.set(k, [...(acts.get(k) ?? []), { effectiveDate: iso(a.effectiveDate), ratio: Number(a.ratio) }]);
  }

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { br, sym, side, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/portfolio/us/activity?${q}` : "/portfolio/us/activity";
  };
  const chip = (label: string, patch: Record<string, string>, active: boolean) => (
    <Link key={label} href={link(patch)} className={`rounded-md px-2.5 py-1 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      {label}
    </Link>
  );
  const group = (children: React.ReactNode) => <div className="inline-flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">{children}</div>;
  const symbols = [...usSymbols].filter((x) => x !== "SPY" && x !== "QQQ").sort();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {group([chip("All brokers", { br: "" }, !br), chip("INDmoney", { br: "INDmoney" }, br === "INDmoney"), chip("IBKR", { br: "IBKR" }, br === "IBKR")])}
        {group([chip("Buy + sell", { side: "" }, !side), chip("Buys", { side: "BUY" }, side === "BUY"), chip("Sells", { side: "SELL" }, side === "SELL")])}
        <form action="/portfolio/us/activity" className="flex items-center gap-1">
          {br && <input type="hidden" name="br" value={br} />}
          {side && <input type="hidden" name="side" value={side} />}
          <select name="sym" defaultValue={sym} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm">
            <option value="">All stocks</option>
            {symbols.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Apply</button>
        </form>
        <span className="text-xs text-slate-500">{total} trade{total === 1 ? "" : "s"}{total > LIMIT ? ` (showing latest ${LIMIT})` : ""}</span>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Trades</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Date (US)</Th><Th right={false}>Broker</Th><Th right={false}>Stock</Th><Th right={false}>Side</Th><Th>Units (as reported)</Th><Th>Price</Th><Th>Amount</Th><Th>Fee</Th><Th right={false}>Broker ref</Th></tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const symbol = symOf.get(t.securityId)!, acct = accKey.get(t.accountId)!;
              const f = splitFactor(acts.get(symbol) ?? [], iso(t.tradeDate));
              return (
                <tr key={t.id} className={rowCls}>
                  <Td right={false}>{fmtDay(iso(t.tradeDate))}</Td>
                  <Td right={false}>{acct === "IBKR" ? "IBKR" : "INDmoney"}</Td>
                  <Td right={false} className="font-medium text-slate-800">{symbol}</Td>
                  <Td right={false}><Badge tone={t.side === "BUY" ? "emerald" : "rose"}>{t.side}</Badge></Td>
                  <Td>
                    {fmtUnits(Number(t.qty))}
                    {f !== 1 && <span className="ml-1"><Badge tone="blue">×{f} since split = {fmtUnits(Number(t.qty) * f)}</Badge></span>}
                  </Td>
                  <Td>{fmtUSD(Number(t.price), 2)}</Td>
                  <Td>{fmtUSD(Number(t.qty) * Number(t.price), 2)}</Td>
                  <Td>{fmtUSD(Number(t.fee), 2)}</Td>
                  <Td right={false} className="max-w-[10rem] truncate font-mono text-xs text-slate-400" title={t.brokerRef}>{t.brokerRef}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2"><Note>Quantities and prices are stored exactly as the broker reported them; stock splits are applied on read from the corporate-actions table.</Note></div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Corporate actions</h2>
          {usActions.length === 0 ? <div className="text-sm text-slate-500">None recorded.</div> : (
            <table className={tableCls}>
              <tbody>
                {usActions.map((a) => (
                  <tr key={a.id} className={rowCls}>
                    <Td right={false} className="font-medium text-slate-800">{a.security.symbol}</Td>
                    <Td right={false}>{a.type === "SPLIT" ? `${Number(a.ratio)}-for-1 split` : a.type}</Td>
                    <Td>effective {fmtDay(iso(a.effectiveDate))}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">Dividends and funding</h2>
          <div className="text-sm text-slate-500">Dividend receipts and INR funding remittances are not ingested yet. Dividends shown elsewhere are estimates from market data; linking remittances to the expense ledger (for FX paid and TCS) is a later phase.</div>
        </Card>

        <Card>
          <h2 className="mb-2 text-sm font-semibold text-slate-900">Open review items</h2>
          {reviews.length === 0 ? (
            <div className="text-sm text-slate-500">Nothing to review. Unit mismatches and rejected sync rows will appear here.</div>
          ) : (
            <ul className="flex flex-col gap-2 text-sm">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <Badge tone="amber">{r.type.replace("_", " ").toLowerCase()}</Badge> <span className="ml-1">{r.detail}</span>
                  <div className="text-xs text-amber-700">{fmtDay(iso(r.createdAt))}</div>
                </li>
              ))}
            </ul>
          )}
          <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">Recent sync batches</h2>
          {batches.length === 0 ? <div className="text-sm text-slate-500">No batches.</div> : (
            <table className={tableCls}>
              <thead className={theadCls}><tr><Th right={false}>When (UTC)</Th><Th right={false}>Source</Th><Th>In</Th><Th>New</Th><Th>Skipped</Th></tr></thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.id} className={rowCls}>
                    <Td right={false}>{b.startedAt.toISOString().slice(0, 16).replace("T", " ")}</Td>
                    <Td right={false}>{b.source}</Td><Td>{b.rowsIn}</Td><Td>{b.rowsInserted}</Td><Td>{b.rowsSkipped}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  );
}
