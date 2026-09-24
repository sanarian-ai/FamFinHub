import { prisma } from "@/lib/prisma";
import { Badge, EmptyState } from "@/components/ui";
import { fmtINR, fmtUnits, fmtDay } from "@/lib/portfolio/format";
import { Tile, Th, Td, tableCls, theadCls, rowCls, Note } from "../india/ui";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";

/**
 * Mutual fund holdings, aggregated by scheme across every CAMS folio (a scheme can legitimately
 * sit in more than one folio — see camsParser.ts). Same minimal current-value treatment as the
 * India equity page (latest broker snapshot x latest known NAV, no lots/IRR here — the engine
 * extension for mutual funds is a separate, not-yet-scoped piece of work); "Refresh NAVs" is the
 * mutual fund counterpart of that page's "Refresh prices" button, sourced from AMFI instead of
 * Yahoo Finance since AMFI is the one that actually publishes MF NAVs.
 */
export default async function MutualFundsPage() {
  const snapshots = await prisma.positionSnapshot.findMany({
    where: { account: { broker: "MF_FOLIO" } },
    orderBy: { asOf: "desc" },
    distinct: ["accountId", "securityId"],
    select: { securityId: true, accountId: true, asOf: true, qty: true, account: { select: { key: true, name: true } } },
  });

  if (snapshots.length === 0) {
    return <EmptyState>No mutual fund holdings yet — upload a CAMS Consolidated Account Statement to get started.</EmptyState>;
  }

  const bySecurity = new Map<string, { qty: number; asOf: Date; folios: { key: string; name: string; qty: number }[] }>();
  for (const s of snapshots) {
    const qty = Number(s.qty);
    if (qty <= 0) continue; // fully redeemed / switched out of this folio
    const existing = bySecurity.get(s.securityId);
    if (existing) {
      existing.qty += qty;
      if (s.asOf > existing.asOf) existing.asOf = s.asOf;
      existing.folios.push({ key: s.account.key, name: s.account.name, qty });
    } else {
      bySecurity.set(s.securityId, { qty, asOf: s.asOf, folios: [{ key: s.account.key, name: s.account.name, qty }] });
    }
  }

  const securities = await prisma.security.findMany({
    where: { id: { in: [...bySecurity.keys()] } },
    select: { id: true, symbol: true, name: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
  });

  const rows = securities
    .map((sec) => {
      const agg = bySecurity.get(sec.id)!;
      const price = sec.prices[0];
      const close = price ? Number(price.close) : null;
      const value = close != null ? agg.qty * close : null;
      return { id: sec.id, symbol: sec.symbol, name: sec.name, qty: agg.qty, close, priceDate: price?.date ?? null, value, asOf: agg.asOf, folios: agg.folios };
    })
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const totalValue = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const withoutPrice = rows.filter((r) => r.close == null).length;
  const folioCount = new Set(snapshots.filter((s) => Number(s.qty) > 0).map((s) => s.accountId)).size;

  const priceDates = rows.map((r) => r.priceDate).filter((d): d is Date => d != null);
  const newestPrice = priceDates.length ? priceDates.reduce((a, b) => (a > b ? a : b)) : null;
  const oldestPrice = priceDates.length ? priceDates.reduce((a, b) => (a < b ? a : b)) : null;
  const asOfDates = rows.map((r) => r.asOf);
  const statementAsOf = asOfDates.length ? asOfDates.reduce((a, b) => (a > b ? a : b)) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-3 gap-4">
          <Tile label="Holdings value" value={fmtINR(totalValue)} sub={newestPrice ? `NAVs as of ${fmtDay(newestPrice.toISOString().slice(0, 10))}` : "No NAVs"} />
          <Tile label="Schemes / folios" value={`${rows.length} / ${folioCount}`} sub={statementAsOf ? `Statement as of ${fmtDay(statementAsOf.toISOString().slice(0, 10))}` : undefined} />
          <Tile
            label="NAV coverage"
            value={`${rows.length - withoutPrice}/${rows.length}`}
            sub={withoutPrice > 0 ? `${withoutPrice} missing a NAV` : "All priced"}
            valueClass={withoutPrice > 0 ? "text-amber-600" : undefined}
          />
        </div>
        <RefreshButton />
      </div>

      {oldestPrice && newestPrice && oldestPrice.getTime() !== newestPrice.getTime() && (
        <Note>
          NAVs are not all as of the same date (oldest {fmtDay(oldestPrice.toISOString().slice(0, 10))}, newest {fmtDay(newestPrice.toISOString().slice(0, 10))}) —
          some schemes are on their last known NAV rather than today&apos;s.
        </Note>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className={tableCls}>
          <thead className={theadCls}>
            <tr>
              <Th right={false}>Scheme</Th>
              <Th>Units</Th>
              <Th>NAV</Th>
              <Th right={false}>As of</Th>
              <Th>Value (INR)</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={rowCls}>
                <Td right={false}>
                  <div className="font-medium text-slate-900">{r.name}</div>
                  <div className="text-xs text-slate-500">
                    {r.symbol} · {r.folios.length > 1 ? `${r.folios.length} folios` : r.folios[0].key.replace(/^MF_FOLIO_/, "")}
                  </div>
                </Td>
                <Td>{fmtUnits(r.qty)}</Td>
                <Td>{r.close != null ? fmtINR(r.close) : "–"}</Td>
                <Td right={false}>
                  {r.priceDate ? fmtDay(r.priceDate.toISOString().slice(0, 10)) : <Badge tone="amber">no NAV</Badge>}
                </Td>
                <Td>{r.value != null ? fmtINR(r.value) : "–"}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
