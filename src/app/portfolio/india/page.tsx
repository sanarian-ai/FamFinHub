import { prisma } from "@/lib/prisma";
import { Badge, Card, EmptyState } from "@/components/ui";
import { getIndiaPortfolioData } from "@/lib/portfolio/india-data";
import { buildLots } from "@/lib/portfolio/engine";
import { positions } from "@/lib/portfolio/views";
import { fmtDay, fmtMoney, fmtPct, fmtUnits, tone } from "@/lib/portfolio/format";
import { CATEGORICAL } from "@/app/insights/chartTheme";
import { Fragment } from "react";
import { Note, rowCls, tableCls, Td, Th, theadCls, Tile } from "./ui";
import { RefreshButton } from "./RefreshButton";
import { RollupSubNav } from "./RollupSubNav";
import { HolderToggle, parseQ } from "./rollupControls";
import type { Position } from "@/lib/portfolio/views";
import type { IndiaChannel } from "@/lib/portfolio/india-data";

export const dynamic = "force-dynamic";
const CUR = "INR" as const;

// General categorization for the blended "Engine-tracked positions" table below — matches the
// grouping /portfolio/all's own asset-class table uses (Indian direct equity / PMS / Mutual funds
// by SEBI category), added 2026-09-26 per Sangeeth's request. "Indian direct equity" here is this
// page's own broader Equity channel scope (Zerodha + Kotak Securities + IIFL combined, i.e.
// channelAccounts.EQUITY), not the narrower IIFL-only "indianEquity" class on /portfolio/all — kept
// unqualified rather than borrowing that page's "(IIFL)" label, which would be wrong here.
type Category = "equity" | "pms" | "mfEquity" | "mfDebt" | "mfHybrid" | "mfCommodity" | "other";
const CATEGORY_ORDER: Category[] = ["equity", "pms", "mfEquity", "mfDebt", "mfHybrid", "mfCommodity", "other"];
const CATEGORY_TABLE_LABEL: Record<Category, string> = {
  equity: "Indian direct equity",
  pms: "PMS (Kabir)",
  mfEquity: "Mutual funds — Equity",
  mfDebt: "Mutual funds — Debt",
  mfHybrid: "Mutual funds — Hybrid",
  mfCommodity: "Mutual funds — Commodity",
  other: "Other",
};
function categoryOf(p: Position, channelAccounts: Record<IndiaChannel, string[]>, mfCatOf: Map<string, string | null>): Category {
  const acc = p.lots[0]?.account;
  if (acc && channelAccounts.PMS.includes(acc)) return "pms";
  if (acc && channelAccounts.MF.includes(acc)) {
    const c = mfCatOf.get(p.symbol);
    if (c === "EQUITY") return "mfEquity";
    if (c === "DEBT") return "mfDebt";
    if (c === "HYBRID") return "mfHybrid";
    if (c === "COMMODITY") return "mfCommodity";
    return "other";
  }
  if (acc && channelAccounts.EQUITY.includes(acc)) return "equity";
  return "other";
}

type SnapRow = {
  id: string; symbol: string; name: string; qty: number;
  close: number | null; priceDate: Date | null; value: number | null;
};
type SnapGroup = { key: string; name: string; holder: string; rows: SnapRow[]; totalValue: number; snapshotAsOf: Date | null };

/**
 * Snapshot-only loader for India Equity accounts (Zerodha / Kotak Securities / IIFL) that still
 * have zero dated trade history — carried over from the pre-rollup /portfolio/india stub, which
 * covered all four direct-equity accounts including Kabir PMS. Kabir PMS moved to the engine-backed
 * buildLots()/positions() path in step 2 (real transactions + sourced NAV history), so this loader
 * is now scoped to whichever accounts *remain* snapshot-only — resolved dynamically by absence of
 * trades in Ctx, not a hardcoded account list, so it naturally shrinks as tradebooks get ingested.
 */
async function loadSnapshotGroup(key: string): Promise<SnapGroup | null> {
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

  const securities = await prisma.security.findMany({
    where: { id: { in: [...latestQty.keys()] } },
    select: { id: true, symbol: true, name: true, prices: { orderBy: { date: "desc" }, take: 1, select: { date: true, close: true } } },
  });

  const rows: SnapRow[] = securities
    .map((sec) => {
      const pos = latestQty.get(sec.id);
      const price = sec.prices[0];
      const qty = pos?.qty ?? 0;
      const close = price ? Number(price.close) : null;
      const value = close != null ? qty * close : null;
      return { id: sec.id, symbol: sec.symbol, name: sec.name, qty, close, priceDate: price?.date ?? null, value };
    })
    .filter((r) => r.qty > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const totalValue = rows.reduce((sum, r) => sum + (r.value ?? 0), 0);
  return { key: account.key, name: account.name, holder: account.holder, rows, totalValue, snapshotAsOf };
}

/**
 * India rollup Overview — a blended holdings summary across all three channels (direct Equity, PMS,
 * Mutual Funds), built holdings-first per the locked Overview=holdings-summary / Performance=IRR
 * convention (see /portfolio/us and /portfolio/india/equity for the same restructure). Two data
 * sources combine here: the engine's real FIFO positions (PMS + MF, which have dated trade history
 * and sourced NAVs) and a snapshot-only qty x latest-price table for the Equity accounts that don't
 * yet have tradebooks ingested — kept visibly separate since only the former feeds IRR on Performance.
 */
export default async function IndiaOverview({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const q = parseQ(await searchParams);
  const { ctx, ds, channelAccounts, holderAccounts, lotAccounts } = await getIndiaPortfolioData();
  const accounts = holderAccounts[q.h];
  // buildLots()/positions() must never see the closed-vehicle accounts (KCV/KFV/Unifi) — their
  // "qty 1 per contribution/withdrawal" cashflow encoding isn't a real position lifecycle and FIFO-
  // matching it throws (a real oversell, not a bug) for two of the four. See india-data.ts's
  // `lotAccounts` comment. They still feed IRR on Performance via engine.run(), just not here.
  const inScope = (list: readonly string[]) => accounts.filter((a) => list.includes(a) && lotAccounts.includes(a));

  const book = buildLots(ds, inScope(channelAccounts.ALL));
  const pos = positions(ctx, book);
  const gain = pos.totalValue - pos.totalCost;

  const channelValue = (ch: "PMS" | "MF") => positions(ctx, buildLots(ds, inScope(channelAccounts[ch]))).totalValue;
  const pmsValue = channelValue("PMS");
  const mfValue = channelValue("MF");

  const equityAccounts = inScope(channelAccounts.EQUITY);
  const snapshotAccounts = equityAccounts.filter((a) => !ctx.trades.some((t) => t.account === a));
  const tradedEquityAccounts = equityAccounts.filter((a) => ctx.trades.some((t) => t.account === a));
  const snapGroups = (await Promise.all(snapshotAccounts.map(loadSnapshotGroup))).filter(
    (g): g is SnapGroup => g != null && g.rows.length > 0
  );
  const equityTradedValue = tradedEquityAccounts.length
    ? positions(ctx, buildLots(ds, tradedEquityAccounts)).totalValue
    : 0;
  const snapTotal = snapGroups.reduce((s, g) => s + g.totalValue, 0);
  const equityValue = snapTotal + equityTradedValue;

  const totalIndiaValue = pos.totalValue + snapTotal; // pos already includes tradedEquityAccounts via `book`
  const positionCount = pos.rows.length + snapGroups.reduce((s, g) => s + g.rows.length, 0);
  const channelsWithData = [equityValue > 0, pmsValue > 0, mfValue > 0].filter(Boolean).length;

  const priceDates = snapGroups.flatMap((g) => g.rows.map((r) => r.priceDate)).filter((d): d is Date => d != null);
  const newestSnapPrice = priceDates.length ? priceDates.reduce((a, b) => (a > b ? a : b)) : null;

  if (positionCount === 0) {
    return <EmptyState>No India holdings found yet across any tracked account.</EmptyState>;
  }

  // Real names + category for the blended table: pos.rows is engine-generic (symbol only — an ISIN
  // for MF, a ticker for Equity/PMS), so this page's own security lookup fills in what Security
  // already has (name, mfCategory) rather than showing the raw symbol as the primary label. Mirrors
  // the exact nameOf/catOf pattern india/mf/page.tsx already uses for its own Positions table.
  const securities = pos.rows.length
    ? await prisma.security.findMany({
        where: { symbol: { in: pos.rows.map((r) => r.symbol) } },
        select: { symbol: true, name: true, mfCategory: true },
      })
    : [];
  const nameOf = new Map(securities.map((s) => [s.symbol, s.name]));
  const mfCatOf = new Map(securities.map((s) => [s.symbol, s.mfCategory]));

  const grouped = new Map<Category, typeof pos.rows>();
  for (const p of pos.rows) {
    const c = categoryOf(p, channelAccounts, mfCatOf);
    grouped.set(c, [...(grouped.get(c) ?? []), p]);
  }
  const categoriesPresent = CATEGORY_ORDER.filter((c) => (grouped.get(c)?.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-5">
      <RollupSubNav />

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          Engine prices to {fmtDay(ctx.asof)}
          {newestSnapPrice ? ` · equity snapshot prices to ${fmtDay(newestSnapPrice.toISOString().slice(0, 10))}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <HolderToggle base="/portfolio/india" q={q} />
          <RefreshButton />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Total India value"
          value={fmtMoney(totalIndiaValue, CUR)}
          sub={`${positionCount} position${positionCount === 1 ? "" : "s"} · ${channelsWithData} channel${channelsWithData === 1 ? "" : "s"}`}
        />
        <a href="/portfolio/india/equity"><Tile label="Equity (direct demat)" dot={CATEGORICAL[0]} value={fmtMoney(equityValue, CUR)} sub={snapshotAccounts.length ? "mostly snapshot only — no IRR yet" : "engine-tracked"} /></a>
        <Tile label="PMS" dot={CATEGORICAL[1]} value={fmtMoney(pmsValue, CUR)} sub="engine-tracked, FIFO lots" />
        <a href="/portfolio/india/mf"><Tile label="Mutual funds" dot={CATEGORICAL[2]} value={fmtMoney(mfValue, CUR)} sub={mfValue > 0 ? "engine-tracked, FIFO lots" : "not ingested yet"} /></a>
      </div>

      {pos.rows.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <div className="px-5 pt-4 text-sm font-semibold text-slate-900">Engine-tracked positions (Equity + PMS + Mutual Funds)</div>
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr><Th right={false}>Security</Th><Th>Units</Th><Th>Avg cost</Th><Th>Price</Th><Th>Value</Th><Th>Weight</Th><Th>Unrealised</Th><Th>%</Th></tr>
            </thead>
            <tbody>
              {categoriesPresent.map((cat) => {
                const rows = grouped.get(cat)!;
                const catValue = rows.reduce((s, p) => s + p.value, 0);
                return (
                  <Fragment key={cat}>
                    <tr className="border-t border-slate-200 bg-slate-50">
                      <td colSpan={4} className="px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {CATEGORY_TABLE_LABEL[cat]} <span className="font-normal normal-case text-slate-400">· {rows.length} position{rows.length === 1 ? "" : "s"}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-500">{fmtMoney(catValue, CUR)}</td>
                      <td className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums text-slate-500">{fmtPct(pos.totalValue ? catValue / pos.totalValue : 0)}</td>
                      <td colSpan={2} className="px-3 py-1.5" />
                    </tr>
                    {rows.map((p, i) => (
                      <tr key={p.symbol} className={rowCls}>
                        <Td right={false} className="font-medium text-slate-800">
                          <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: CATEGORICAL[i % CATEGORICAL.length] }} />
                          {nameOf.get(p.symbol) ?? p.symbol}
                          {nameOf.get(p.symbol) && <div className="ml-3.5 text-xs font-normal text-slate-400">{p.symbol}</div>}
                          {new Set(p.lots.map((l) => l.account)).size > 1 && <span className="ml-2"><Badge tone="blue">multiple accounts</Badge></span>}
                        </Td>
                        <Td>{fmtUnits(p.units)}</Td>
                        <Td>{fmtMoney(p.avgCost, CUR)}</Td>
                        <Td>{fmtMoney(p.price, CUR)}</Td>
                        <Td>{fmtMoney(p.value, CUR)}</Td>
                        <Td>{fmtPct(p.weight)}</Td>
                        <Td className={tone(p.gain)}>{fmtMoney(p.gain, CUR)}</Td>
                        <Td className={tone(p.gainPct)}>{fmtPct(p.gainPct, 1, true)}</Td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}
              <tr className="border-t border-slate-200 font-semibold">
                <Td right={false}>Total</Td><Td /><Td /><Td />
                <Td>{fmtMoney(pos.totalValue, CUR)}</Td><Td>100%</Td>
                <Td className={tone(gain)}>{fmtMoney(gain, CUR)}</Td><Td className={tone(gain)}>{fmtPct(pos.totalCost ? gain / pos.totalCost : 0, 1, true)}</Td>
              </tr>
            </tbody>
          </table>
          <div className="px-5 pb-4 pt-2">
            <Note>
              Real FIFO positions with dated trade history — feeds IRR, alpha vs Nifty 500 TRI, and the channel/holder cuts on Performance.
              Includes any Equity, PMS, or Mutual Fund accounts with dated trades, grouped the same way as the asset-class breakdown on{" "}
              <a href="/portfolio/all" className="underline">All Assets</a>.
            </Note>
          </div>
        </Card>
      )}

      {snapGroups.map((g) => (
        <Card key={g.key}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                {g.name} <Badge tone="amber">snapshot only</Badge>
              </h2>
              <span className="text-xs text-slate-500">
                {g.holder} · {g.rows.length} position{g.rows.length === 1 ? "" : "s"}
                {g.snapshotAsOf ? ` · snapshot ${fmtDay(g.snapshotAsOf.toISOString().slice(0, 10))}` : ""}
              </span>
            </div>
            <span className="text-sm font-semibold tabular-nums text-slate-900">{fmtMoney(g.totalValue, CUR)}</span>
          </div>
          <table className={tableCls}>
            <thead className={theadCls}>
              <tr>
                <Th right={false}>Security</Th>
                <Th>Qty</Th>
                <Th>Price</Th>
                <Th right={false}>As of</Th>
                <Th>Value</Th>
              </tr>
            </thead>
            <tbody>
              {g.rows.map((r) => (
                <tr key={r.id} className={rowCls}>
                  <Td right={false} className="font-medium text-slate-900">{r.symbol}<div className="text-xs font-normal text-slate-500">{r.name}</div></Td>
                  <Td>{fmtUnits(r.qty)}</Td>
                  <Td>{r.close != null ? fmtMoney(r.close, CUR) : "–"}</Td>
                  <Td right={false}>{r.priceDate ? fmtDay(r.priceDate.toISOString().slice(0, 10)) : <Badge tone="amber">no price</Badge>}</Td>
                  <Td>{r.value != null ? fmtMoney(r.value, CUR) : "–"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}

      <Note>
        Qty x latest-price snapshot — no dated trade history yet, so it&apos;s left out of the IRR/alpha figures on Performance until a
        tradebook is ingested. See <a href="/portfolio/india/equity" className="underline">India Equity</a> for this channel&apos;s own detail pages.
      </Note>
    </div>
  );
}
