import { prisma } from "@/lib/prisma";
import { Badge, Card, EmptyState } from "@/components/ui";
import { fmtINR, fmtUnits, fmtDay } from "@/lib/portfolio/format";
import { Tile, Th, Td, tableCls, theadCls, rowCls, Note } from "./ui";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";

/** Fixed display order: Ria's two direct-equity demats first (PMS then IIFL), then the two NSE
 *  holdings (Sangeeth via Zerodha, Ria via Kotak Securities) — same accounts src/lib/portfolio/
 *  networth.ts's getKabirPmsActual/getIiflActual/getNseActual sum for the /portfolio/all and
 *  retirement baseline totals, just shown here per-account instead of rolled into one figure. */
const ACCOUNT_KEYS = ["KABIR_PMS_RIA", "IIFL_DEMAT_RIA", "ZERODHA_SANGEETH", "KOTAK_SECURITIES_RIA"] as const;

type Row = {
  id: string; symbol: string; name: string; kind: string; qty: number;
  close: number | null; priceDate: Date | null; value: number | null;
};
type AccountGroup = { key: string; name: string; holder: string; rows: Row[]; totalValue: number; snapshotAsOf: Date | null };

async function loadAccountGroup(key: string): Promise<AccountGroup | null> {
  const account = await prisma.portfolioAccount.findUnique({ where: { key } });
  if (!account) return null;

  const snapshots = await prisma.positionSnapshot.findMany({
    where: { accountId: account.id },
    orderBy: { asOf: "desc" },
    select: { securityId: true, asOf: true, qty: true },
  });

  const latestQty = new Map<string, { qty: number; asOf: Date }>();
  for (const s of snapshots) {
    if (!latestQty.has(s.securityId)) latestQty.set(s.securityId, { qty: Number(s.qty), asOf: s.asOf });
  }
  const snapshotAsOf = snapshots[0]?.asOf ?? null;

  // Securities are looked up by the snapshot's own securityId, not via a PortfolioTransaction
  // relation: only Kabir PMS has transaction history behind its snapshots — IIFL and the two NSE
  // accounts (Zerodha, Kotak Securities) were seeded straight from the INDmoney MCP as snapshots
  // only, no PortfolioTransaction rows, so a transactions-based join silently returns zero
  // securities for them. Snapshot-derived IDs work for every account here.
  const securities = await prisma.security.findMany({
    where: { id: { in: [...latestQty.keys()] } },
    select: { id: true, symbol: true, name: true, kind: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
  });

  const rows: Row[] = securities
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
  return { key: account.key, name: account.name, holder: account.holder, rows, totalValue, snapshotAsOf };
}

/**
 * India equity holdings across all four tracked direct-equity accounts, grouped by account:
 * Ria's Kabir Capital PMS (Nuvama demat), Ria's IIFL demat, Sangeeth's Zerodha NSE holding, and
 * Ria's Kotak Securities NSE holding. Broadened 2026-09-24 from Kabir-only — deliberately still
 * NOT the engine-backed US holdings page (no lots, FIFO, tax lots or IRR here; see load.ts /
 * us/holdings). Just: current qty (latest broker snapshot) x latest known price per account, so
 * the shared "Refresh prices" button has something to refresh across every account at once.
 */
export default async function IndiaPage() {
  const groups = (await Promise.all(ACCOUNT_KEYS.map(loadAccountGroup))).filter(
    (g): g is AccountGroup => g != null && g.rows.length > 0
  );

  if (groups.length === 0) {
    return <EmptyState>No India equity holdings found yet across any tracked account.</EmptyState>;
  }

  const allRows = groups.flatMap((g) => g.rows);
  const totalValue = groups.reduce((s, g) => s + g.totalValue, 0);
  const withoutPrice = allRows.filter((r) => r.close == null).length;

  const priceDates = allRows.map((r) => r.priceDate).filter((d): d is Date => d != null);
  const oldestPrice = priceDates.length ? priceDates.reduce((a, b) => (a < b ? a : b)) : null;
  const newestPrice = priceDates.length ? priceDates.reduce((a, b) => (a > b ? a : b)) : null;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="grid grid-cols-3 gap-4">
          <Tile label="Holdings value" value={fmtINR(totalValue)} sub={newestPrice ? `Prices as of ${fmtDay(newestPrice.toISOString().slice(0, 10))}` : "No prices"} />
          <Tile label="Positions" value={String(allRows.length)} sub={`${groups.length} account${groups.length === 1 ? "" : "s"}`} />
          <Tile
            label="Price coverage"
            value={`${allRows.length - withoutPrice}/${allRows.length}`}
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

      {groups.map((g) => (
        <Card key={g.key}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">{g.name}</h2>
              <span className="text-xs text-slate-500">
                {g.holder} · {g.rows.length} position{g.rows.length === 1 ? "" : "s"}
                {g.snapshotAsOf ? ` · snapshot ${fmtDay(g.snapshotAsOf.toISOString().slice(0, 10))}` : ""}
              </span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{fmtINR(g.totalValue)}</span>
          </div>
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
              {g.rows.map((r) => (
                <tr key={r.id} className={rowCls}>
                  <Td right={false}>
                    <div className="font-medium text-slate-900">{r.symbol}</div>
                    <div className="text-xs text-slate-500">{r.name}</div>
                  </Td>
                  <Td>{fmtUnits(r.qty)}</Td>
                  <Td>{r.close != null ? fmtINR(r.close) : "–"}</Td>
                  <Td right={false}>
                    {r.priceDate ? fmtDay(r.priceDate.toISOString().slice(0, 10)) : <Badge tone="amber">no price</Badge>}
                  </Td>
                  <Td>{r.value != null ? fmtINR(r.value) : "–"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  );
}
