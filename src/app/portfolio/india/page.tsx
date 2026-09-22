import { prisma } from "@/lib/prisma";
import { Badge, EmptyState } from "@/components/ui";
import { fmtINR, fmtUnits, fmtDay } from "@/lib/portfolio/format";
import { Tile, Th, Td, tableCls, theadCls, rowCls, Note } from "./ui";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";

/**
 * Minimal India/Kabir PMS holdings view — deliberately NOT the engine-backed US holdings page
 * (no lots, FIFO, tax lots or IRR here; see load.ts / us/holdings). Just: current qty (latest
 * broker snapshot) x latest known price, so the "Refresh prices" button has something to refresh.
 * A fuller P3/P4 engine treatment for Kabir is a separate, not-yet-scoped piece of work.
 */
export default async function IndiaPage() {
  const account = await prisma.portfolioAccount.findUnique({ where: { key: "KABIR_PMS_RIA" } });
  if (!account) {
    return <EmptyState>No Kabir PMS account found (expected portfolio_accounts.key = &quot;KABIR_PMS_RIA&quot;).</EmptyState>;
  }

  const [snapshots, securities] = await Promise.all([
    prisma.positionSnapshot.findMany({
      where: { accountId: account.id },
      orderBy: { asOf: "desc" },
      select: { securityId: true, asOf: true, qty: true },
    }),
    prisma.security.findMany({
      where: { transactions: { some: { accountId: account.id } } },
      select: { id: true, symbol: true, name: true, kind: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
    }),
  ]);

  // Latest snapshot per security (snapshots already ordered desc, so first hit wins).
  const latestQty = new Map<string, { qty: number; asOf: Date }>();
  for (const s of snapshots) {
    if (!latestQty.has(s.securityId)) latestQty.set(s.securityId, { qty: Number(s.qty), asOf: s.asOf });
  }
  const snapshotAsOf = snapshots[0]?.asOf ?? null;

  const rows = securities
    .map((sec) => {
      const pos = latestQty.get(sec.id);
      const price = sec.prices[0];
      const qty = pos?.qty ?? 0;
      const close = price ? Number(price.close) : null;
      const value = close != null ? qty * close : null;
      return { id: sec.id, symbol: sec.symbol, name: sec.name, kind: sec.kind, qty, close, priceDate: price?.date ?? null, value };
    })
    .filter((r) => r.qty > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const totalValue = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  const withoutPrice = rows.filter((r) => r.close == null).length;

  const priceDates = rows.map((r) => r.priceDate).filter((d): d is Date => d != null);
  const oldestPrice = priceDates.length ? priceDates.reduce((a, b) => (a < b ? a : b)) : null;
  const newestPrice = priceDates.length ? priceDates.reduce((a, b) => (a > b ? a : b)) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-3 gap-4">
          <Tile label="Holdings value" value={fmtINR(totalValue)} sub={newestPrice ? `Prices as of ${fmtDay(newestPrice.toISOString().slice(0, 10))}` : "No prices"} />
          <Tile label="Positions" value={String(rows.length)} sub={snapshotAsOf ? `Snapshot ${fmtDay(snapshotAsOf.toISOString().slice(0, 10))}` : undefined} />
          <Tile
            label="Price coverage"
            value={`${rows.length - withoutPrice}/${rows.length}`}
            sub={withoutPrice > 0 ? `${withoutPrice} missing a price` : "All priced"}
            valueClass={withoutPrice > 0 ? "text-amber-600" : undefined}
          />
        </div>
        <RefreshButton />
      </div>

      {oldestPrice && newestPrice && oldestPrice.getTime() !== newestPrice.getTime() && (
        <Note>
          Prices are not all as of the same date (oldest {fmtDay(oldestPrice.toISOString().slice(0, 10))}, newest {fmtDay(newestPrice.toISOString().slice(0, 10))}) —
          some symbols are on their last known price rather than today&apos;s close.
        </Note>
      )}

      {rows.length === 0 ? (
        <EmptyState>No current Kabir PMS holdings (no positive-quantity position snapshot).</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <Th right={false}>Security</Th>
                <Th>Qty</Th>
                <Th>Price</Th>
                <Th right={false}>As of</Th>
                <Th>Value (INR)</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={rowCls}>
                  <Td right={false}>
                    <div className="font-medium text-slate-900">{r.symbol}</div>
                    <div className="text-xs text-slate-500">{r.name}</div>
                  </Td>
                  <Td>{fmtUnits(r.qty)}</Td>
                  <Td>{r.close != null ? fmtINR(r.close) : "–"}</Td>
                  <Td right={false}>
                    {r.priceDate ? (
                      fmtDay(r.priceDate.toISOString().slice(0, 10))
                    ) : (
                      <Badge tone="amber">no price</Badge>
                    )}
                  </Td>
                  <Td>{r.value != null ? fmtINR(r.value) : "–"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
