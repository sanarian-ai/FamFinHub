import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtUnits, fmtMoney } from "@/lib/portfolio/format";
import { splitFactor } from "@/lib/portfolio/splits";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { Note, rowCls, tableCls, Td, Th, theadCls } from "../../ui";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LIMIT = 200;
const CUR = "INR" as const;

/** Dated trade ledger across all 5 PMS accounts (live Kabir PMS + 4 closed vehicles). Account
 * names come straight from the DB (PortfolioAccount.name) — unlike India Equity's ACCOUNT_LABEL
 * map, every PMS account already has a good display name, so no lookup table is needed. */
export default async function IndiaPmsActivity({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const acc = s("acc"), side = s("side");

  const { channelAccounts } = await getIndiaPortfolioData();
  const pmsAccounts = channelAccounts.PMS;

  const [accounts, securities, actions] = await Promise.all([
    prisma.portfolioAccount.findMany({ where: { key: { in: pmsAccounts } }, select: { id: true, key: true, name: true } }),
    prisma.security.findMany({ where: { transactions: { some: { account: { key: { in: pmsAccounts } } } } }, select: { id: true, symbol: true } }),
    prisma.corporateAction.findMany({ where: { security: { transactions: { some: { account: { key: { in: pmsAccounts } } } } } }, include: { security: { select: { symbol: true } } }, orderBy: { effectiveDate: "desc" } }),
  ]);
  const accKey = new Map(accounts.map((a) => [a.id, a.key]));
  const accLabel = new Map(accounts.map((a) => [a.key, a.name]));
  const symOf = new Map(securities.map((x) => [x.id, x.symbol]));

  const scopedAccounts = acc && pmsAccounts.includes(acc) ? [acc] : pmsAccounts;
  const where = {
    account: { key: { in: scopedAccounts } },
    ...(side === "BUY" || side === "SELL" ? { side: side as "BUY" | "SELL" } : {}),
  };
  const [total, trades, pmsTotal] = await Promise.all([
    prisma.portfolioTransaction.count({ where }),
    prisma.portfolioTransaction.findMany({ where, orderBy: [{ tradeDate: "desc" }, { execTs: "desc" }], take: LIMIT }),
    prisma.portfolioTransaction.count({ where: { account: { key: { in: pmsAccounts } } } }),
  ]);
  if (pmsTotal === 0) return <EmptyState>No dated trade history yet for India PMS.</EmptyState>;

  const acts = new Map<string, { effectiveDate: string; ratio: number }[]>();
  for (const a of actions) {
    const k = a.security.symbol;
    acts.set(k, [...(acts.get(k) ?? []), { effectiveDate: iso(a.effectiveDate), ratio: Number(a.ratio) }]);
  }

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { acc, side, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/portfolio/india/pms/activity?${q}` : "/portfolio/india/pms/activity";
  };
  const chip = (label: string, patch: Record<string, string>, active: boolean) => (
    <Link key={label} href={link(patch)} className={`rounded-md px-2.5 py-1 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      {label}
    </Link>
  );
  const group = (children: React.ReactNode) => <div className="inline-flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">{children}</div>;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {group([chip("Buy + sell", { side: "" }, !side), chip("Buys / contributions", { side: "BUY" }, side === "BUY"), chip("Sells / withdrawals", { side: "SELL" }, side === "SELL")])}
        <form action="/portfolio/india/pms/activity" className="flex items-center gap-1">
          {side && <input type="hidden" name="side" value={side} />}
          <select name="acc" defaultValue={acc} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm">
            <option value="">All vehicles</option>
            {pmsAccounts.map((k) => <option key={k} value={k}>{accLabel.get(k) ?? k}</option>)}
          </select>
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Apply</button>
        </form>
        <span className="text-xs text-slate-500">{total} trade{total === 1 ? "" : "s"}{total > LIMIT ? ` (showing latest ${LIMIT})` : ""}</span>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Trades</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Date</Th><Th right={false}>Vehicle</Th><Th right={false}>Security</Th><Th right={false}>Side</Th><Th>Units</Th><Th>Price</Th><Th>Amount</Th><Th>Fee</Th><Th right={false}>Broker ref</Th></tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const symbol = symOf.get(t.securityId)!, acctKey = accKey.get(t.accountId)!;
              const f = splitFactor(acts.get(symbol) ?? [], iso(t.tradeDate));
              return (
                <tr key={t.id} className={rowCls}>
                  <Td right={false}>{fmtDay(iso(t.tradeDate))}</Td>
                  <Td right={false}>{accLabel.get(acctKey) ?? acctKey}</Td>
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
        <div className="px-5 pb-4 pt-2">
          <Note>
            For the live Kabir PMS account, each row is a real trade (units, price, fee as reported). For the 4 closed vehicles, each row is a
            contribution (BUY) or withdrawal (SELL) recorded at qty 1 — the "price" column is the rupee amount of that flow, not a market price.
          </Note>
        </div>
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
        <div className="text-sm text-slate-500">Dividend receipts are not ingested yet for India PMS.</div>
      </Card>
    </div>
  );
}
