import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtUnits, fmtMoney } from "@/lib/portfolio/format";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { Note, rowCls, tableCls, Td, Th, theadCls } from "../../ui";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LIMIT = 200;
const CUR = "INR" as const;

/** Dated trade ledger across every MF_FOLIO account. Account (folio) names come straight from
 * PortfolioAccount.name (already descriptive — "<AMC> Mutual Fund - Folio <no.>") and scheme names
 * from Security.name, same as the scheme-name resolution used on Overview/Holdings — showing the
 * ISIN (Security.symbol) alone would be unreadable here, unlike Equity where the ticker itself is
 * the readable identifier. */
export default async function IndiaMfActivity({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const acc = s("acc"), sym = s("sym"), side = s("side");

  const { channelAccounts } = await getIndiaPortfolioData();
  const mfAccounts = channelAccounts.MF;

  const [accounts, securities, actions] = await Promise.all([
    prisma.portfolioAccount.findMany({ where: { key: { in: mfAccounts } }, select: { id: true, key: true, name: true } }),
    prisma.security.findMany({ where: { transactions: { some: { account: { key: { in: mfAccounts } } } } }, select: { id: true, symbol: true, name: true } }),
    prisma.corporateAction.findMany({ where: { security: { transactions: { some: { account: { key: { in: mfAccounts } } } } } }, include: { security: { select: { symbol: true } } }, orderBy: { effectiveDate: "desc" } }),
  ]);
  const accKey = new Map(accounts.map((a) => [a.id, a.key]));
  const accLabel = new Map(accounts.map((a) => [a.key, a.name]));
  const symOf = new Map(securities.map((x) => [x.id, x.symbol]));
  const nameOf = new Map(securities.map((x) => [x.symbol, x.name]));

  const scopedAccounts = acc && mfAccounts.includes(acc) ? [acc] : mfAccounts;
  const where = {
    account: { key: { in: scopedAccounts } },
    ...(sym ? { security: { symbol: sym } } : {}),
    ...(side === "BUY" || side === "SELL" ? { side: side as "BUY" | "SELL" } : {}),
  };
  const [total, trades, mfTotal] = await Promise.all([
    prisma.portfolioTransaction.count({ where }),
    prisma.portfolioTransaction.findMany({ where, orderBy: [{ tradeDate: "desc" }, { execTs: "desc" }], take: LIMIT }),
    prisma.portfolioTransaction.count({ where: { account: { key: { in: mfAccounts } } } }),
  ]);
  if (mfTotal === 0) return <EmptyState>No mutual fund holdings yet — upload a CAMS Consolidated Account Statement to get started.</EmptyState>;

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { acc, sym, side, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/portfolio/india/mf/activity?${q}` : "/portfolio/india/mf/activity";
  };
  const chip = (label: string, patch: Record<string, string>, active: boolean) => (
    <Link key={label} href={link(patch)} className={`rounded-md px-2.5 py-1 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
      {label}
    </Link>
  );
  const group = (children: React.ReactNode) => <div className="inline-flex gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">{children}</div>;
  const schemes = [...new Set(securities.map((x) => x.symbol))].map((sy) => ({ sy, name: nameOf.get(sy) ?? sy })).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        {group([chip("Buy + sell", { side: "" }, !side), chip("Purchases", { side: "BUY" }, side === "BUY"), chip("Redemptions", { side: "SELL" }, side === "SELL")])}
        <form action="/portfolio/india/mf/activity" className="flex flex-wrap items-center gap-1">
          {side && <input type="hidden" name="side" value={side} />}
          <select name="acc" defaultValue={acc} className="max-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm">
            <option value="">All folios</option>
            {accounts.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
          <select name="sym" defaultValue={sym} className="max-w-[16rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm">
            <option value="">All schemes</option>
            {schemes.map((sc) => <option key={sc.sy} value={sc.sy}>{sc.name}</option>)}
          </select>
          <button className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">Apply</button>
        </form>
        <span className="text-xs text-slate-500">{total} transaction{total === 1 ? "" : "s"}{total > LIMIT ? ` (showing latest ${LIMIT})` : ""}</span>
      </div>

      <Card className="overflow-x-auto p-0">
        <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Transactions</div>
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr><Th right={false}>Date</Th><Th right={false}>Folio</Th><Th right={false}>Scheme</Th><Th right={false}>Type</Th><Th>Units</Th><Th>NAV</Th><Th>Amount</Th><Th>Fee</Th><Th right={false}>Broker ref</Th></tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const symbol = symOf.get(t.securityId)!, acctKey = accKey.get(t.accountId)!;
              return (
                <tr key={t.id} className={rowCls}>
                  <Td right={false}>{fmtDay(iso(t.tradeDate))}</Td>
                  <Td right={false} className="max-w-[12rem] truncate" title={accLabel.get(acctKey) ?? acctKey}>{accLabel.get(acctKey) ?? acctKey}</Td>
                  <Td right={false} className="max-w-[14rem] truncate font-medium text-slate-800" title={nameOf.get(symbol) ?? symbol}>{nameOf.get(symbol) ?? symbol}</Td>
                  <Td right={false}><Badge tone={t.side === "BUY" ? "emerald" : "rose"}>{t.side === "BUY" ? "Purchase" : "Redemption"}</Badge></Td>
                  <Td>{fmtUnits(Number(t.qty))}</Td>
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
            Fee includes stamp duty on purchases and STT on redemptions where CAMS itemised them. A switch (redemption from one scheme paired with a
            same-day purchase into another) appears here as two ordinary rows, not a linked pair — none of the ingested transactions are tagged with
            a switchGroupId today (0 same-day buy+sell pairs found), so this is a labeling note, not a known display bug.
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
                  <Td right={false} className="font-medium text-slate-800">{nameOf.get(a.security.symbol) ?? a.security.symbol}</Td>
                  <Td right={false}>{a.type}</Td>
                  <Td>effective {fmtDay(iso(a.effectiveDate))}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <h2 className="mb-2 mt-5 text-sm font-semibold text-slate-900">Dividends</h2>
        <div className="text-sm text-slate-500">Dividend/IDCW receipts are not ingested yet for India Mutual Funds.</div>
      </Card>
    </div>
  );
}
