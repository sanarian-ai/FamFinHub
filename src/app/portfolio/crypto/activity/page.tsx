import Link from "next/link";
import { Badge, Card, EmptyState } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { fmtDay, fmtMoney } from "@/lib/portfolio/format";
import { CRYPTO_BROKERS } from "@/lib/portfolio/crypto-load";
import { Note, rowCls, tableCls, Td, Th, theadCls, fmtCrypto } from "../ui";
import { SYMBOL_LABEL } from "../constants";

export const dynamic = "force-dynamic";
const iso = (d: Date) => d.toISOString().slice(0, 10);
const LIMIT = 200;
const CUR = "INR" as const;

export default async function CryptoActivity({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const sym = s("sym"), side = s("side");

  const accounts = await prisma.portfolioAccount.findMany({ where: { broker: { in: CRYPTO_BROKERS } }, select: { id: true, key: true } });
  const accountIds = accounts.map((a) => a.id);
  const securities = await prisma.security.findMany({ where: { transactions: { some: { account: { id: { in: accountIds } } } } }, select: { id: true, symbol: true } });
  const symOf = new Map(securities.map((x) => [x.id, x.symbol]));

  const where = {
    account: { id: { in: accountIds } },
    ...(sym ? { security: { symbol: sym } } : {}),
    ...(side === "BUY" || side === "SELL" ? { side: side as "BUY" | "SELL" } : {}),
  };
  const [total, trades, allTotal] = await Promise.all([
    prisma.portfolioTransaction.count({ where }),
    prisma.portfolioTransaction.findMany({ where, orderBy: [{ tradeDate: "desc" }, { execTs: "desc" }], take: LIMIT }),
    prisma.portfolioTransaction.count({ where: { account: { id: { in: accountIds } } } }),
  ]);
  if (allTotal === 0) return <EmptyState>No trades yet. Run scripts/portfolio/coindcx/seed.ts to ingest the CoinDCX order history.</EmptyState>;

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { sym, side, ...patch };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const q = p.toString();
    return q ? `/portfolio/crypto/activity?${q}` : "/portfolio/crypto/activity";
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
        {group([chip("Buy + sell", { side: "" }, !side), chip("Buys", { side: "BUY" }, side === "BUY"), chip("Sells", { side: "SELL" }, side === "SELL")])}
        <form action="/portfolio/crypto/activity" className="flex items-center gap-1">
          {side && <input type="hidden" name="side" value={side} />}
          <select name="sym" defaultValue={sym} className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm shadow-sm">
            <option value="">All coins</option>
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
            <tr><Th right={false}>Date (UTC)</Th><Th right={false}>Coin</Th><Th right={false}>Side</Th><Th>Units</Th><Th>Price</Th><Th>Amount</Th><Th>Fee</Th><Th right={false}>Order ID</Th></tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const symbol = symOf.get(t.securityId)!;
              return (
                <tr key={t.id} className={rowCls}>
                  <Td right={false}>{fmtDay(iso(t.tradeDate))}</Td>
                  <Td right={false} className="font-medium text-slate-800">
                    {symbol} <span className="font-normal text-slate-400">{SYMBOL_LABEL[symbol] ?? ""}</span>
                  </Td>
                  <Td right={false}><Badge tone={t.side === "BUY" ? "emerald" : "rose"}>{t.side}</Badge></Td>
                  <Td>{fmtCrypto(Number(t.qty))}</Td>
                  <Td>{fmtMoney(Number(t.price), CUR)}</Td>
                  <Td>{fmtMoney(Number(t.qty) * Number(t.price), CUR)}</Td>
                  <Td>{fmtMoney(Number(t.fee), CUR)}</Td>
                  <Td right={false} className="max-w-[10rem] truncate font-mono text-xs text-slate-400" title={t.brokerRef}>{t.brokerRef}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-5 pb-4 pt-2"><Note>Quantities and prices are stored exactly as CoinDCX's order history reported them. Dates are UTC (crypto trades 24/7, no exchange session to localize to).</Note></div>
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">Data source</h2>
        <div className="text-sm text-slate-500">Manually uploaded CoinDCX "Order history" .csv export, re-run periodically via scripts/portfolio/coindcx/seed.ts — no live API sync exists for CoinDCX yet.</div>
      </Card>
    </div>
  );
}
