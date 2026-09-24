import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtUnits, fmtMoney } from "@/lib/portfolio/format";
import { splitFactor } from "@/lib/portfolio/splits";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { Note, rowCls, tableCls, Td, Th, theadCls } from "../../ui";
import { ACCOUNT_LABEL } from "../constants";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LIMIT = 200;
const CUR = "INR" as const;

export default async function IndiaEquityActivity({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const h = s("h"), sym = s("sym"), side = s("side");

  const { channelAccounts } = await getIndiaPortfolioData();
  const holderAccounts = h === "SANGEETH" ? ["ZERODHA_SANGEETH"] : h === "RIA" ? ["KOTAK_SECURITIES_RIA", "IIFL_DEMAT_RIA"] : channelAccounts.EQUITY;

  const [accounts, securities, actions] = await Promise.all([
    prisma.portfolioAccount.findMany({ where: { key: { in: channelAccounts.EQUITY } }, select: { id: true, key: true } }),
    prisma.security.findMany({ where: { transactions: { some: { account: { key: { in: channelAccounts.EQUITY } } } } }, select: { id: true, symbol: true } }),
    prisma.corporateAction.findMany({ where: { security: { transactions: { some: { account: { key: { in: channelAccounts.EQUITY } } } } } }, include: { security: { select: { symbol: true } } }, orderBy: { effectiveDate: "desc" } }),
  ]);
  const accKey = new Map(accounts.map((a) => [a.id, a.key]));
  const symOf = new Map(securities.map((x) => [x.id, x.symbol]));

  const where = {
    account: { key: { in: holderAccounts } },
    ...(sym ? { security: { symbol: sym } } : {}),
    ...(side === "BUY" || side === "SELL" ? { side: side as "BUY" | "SELL" } : {}),
  };
  const [total, trades, equityTotal] = await Promise.all([
    prisma.portfolioTransaction.count({ where }),
    prisma.portfolioTransaction.findMany({ where, orderBy: [{ tradeDate: "desc" }, { execTs: "desc" }], take: LIMIT }),
    prisma.portfolioTransaction.count({ where: { account: { key: { in: channelAccounts.EQUITY } } } }),
  ]);
  if (equityTotal === 0) {
    return (
      <EmptyState>
        No dated trade history yet for India Equity (Zerodha / Kotak Securities / IIFL) — only broker position snapshots exist today.
      </EmptyState>
    );
  }
  const acts = new Map<string, { effectiveDate: string; ratio: number }[]>();
  for (const a of actions) {
    const k = a.security.symbol;
    acts.set(k, [...(acts.get(k) ?? []), { effectiveDate: iso(a.effectiveDate), ratio: Number(a.ratio) }]);
  }

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { h, sym, side, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/portfolio/india/equity/activity?${q}` : "/portfolio/india/equity/activity";
  };
  const chip = (label: string, patch: Record<string, string>, active: boolean) => (
    <Link key={label} href={link(patch)} className={`rounded-md px-2.5 py-1 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      {label}
    </Link>
  );
  const group = (children: React.ReactNode) => <div className="inline-flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">{children}</div>;
  const symbols = [...new Set(securities.map((x) => x.symbol))].sort();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {group([chip("Both holders", { h: "" }, !h), chip("Sangeeth", { h: "SANGEETH" }, h === "SANGEETH"), chip("Ria", { h: "RIA" }, h === "RIA")])}
        {group([chip("Buy + sell", { side: "" }, !side), chip("Buys", { side: "BUY" }, side === "BUY"), chip("Sells", { side: "SELL" }, side === "SELL")])}
        <form action="/portfolio/india/equity/activity" className="flex items-center gap-1">
          {h && <input type="hidden" name="h" value={h} />}
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
            <tr><Th right={false}>Date</Th><Th right={false}>Account</Th><Th right={false}>Stock</Th><Th right={false}>Side</Th><Th>Units (as reported)</Th><Th>Price</Th><Th>Amount</Th><Th>Fee</Th><Th right={false}>Broker ref</Th></tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const symbol = symOf.get(t.securityId)!, acct = accKey.get(t.accountId)!;
              const f = splitFactor(acts.get(symbol) ?? [], iso(t.tradeDate));
              return (
                <tr key={t.id} className={rowCls}>
                  <Td right={false}>{fmtDay(iso(t.tradeDate))}</Td>
                  <Td right={false}>{ACCOUNT_LABEL[acct] ?? acct}</Td>
                  <Td right={false} className="font-medium text-slate-800">{symbol}</Td>
                  <Td right={false}><Badge tone={t.side === "BUY" ? "emerald" : "rose"}>{t.side}</Badge></Td>
                  <Td>
                    {fmtUnits(Number(t.qty))}
                    {f !== 1 && <span className="ml-1"><Badge tone="blue">×{f} since split = {fmtUnits(Number(t.qty) * f)}</Badge></span>}
                  </Td>
                  <Td>{fmtMoney(Number(t.price), CUR)}</Td>
                  <Td>{fmtMoney(Number(t.qty) * Number(t.price), CUR)}</Td>
                  <Td>{fmtMoney(Number(t.fee), CUR)}</Td>
                  <Td right={false} className="max-w-[10rem] truncate font-mono text-xs text-slate-400" title={t.brokerRef}>{t.brokerRef}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2"><Note>Quantities and prices are stored exactly as the broker reported them; stock splits are applied on read from the corporate-actions table.</Note></div>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Corporate actions</h2>
        {actions.length === 0 ? <div className="text-sm text-slate-500">None recorded.</div> : (
          <table className={tableCls}>
            <tbody>
              {actions.map((a) => (
                <tr key={a.id} className={rowCls}>
                  <Td right={false} className="font-medium text-slate-800">{a.security.symbol}</Td>
                  <Td right={false}>{a.type === "SPLIT" ? `${Number(a.ratio)}-for-1 split` : a.type}</Td>
                  <Td>effective {fmtDay(iso(a.effectiveDate))}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">Dividends</h2>
        <div className="text-sm text-slate-500">Dividend receipts are not ingested yet for India Equity.</div>
      </Card>
    </div>
  );
}
