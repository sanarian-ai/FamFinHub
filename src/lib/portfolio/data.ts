// Server-side loader shared by the Portfolio screens. Small in-process memo (60s) so tab switches and
// period changes don't reload ~15k price rows from Supabase every time.
import { prisma } from "@/lib/prisma";
import { buildContext, buildLots, type Ctx, type Dataset, type LotBook } from "./engine";
import { computeReconciliation, type ReconRow } from "./ingest";
import { loadDataset } from "./load";

export type Health = {
  pricesAsOf: string; positionsAsOf: string | null; lastBatchAt: Date | null;
  recon: ReconRow[]; reconOk: number; openReviews: number; stalePrices: boolean; staleSnapshot: boolean;
};
export type PortfolioData = { ds: Dataset; ctx: Ctx; book: LotBook; health: Health; empty: boolean };

let memo: { at: number; v: PortfolioData } | null = null;
const TTL_MS = 60_000;

export async function getPortfolioData(): Promise<PortfolioData> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.v;
  const [ds, recon, openReviews, lastBatch, snap] = await Promise.all([
    loadDataset(prisma),
    computeReconciliation(prisma),
    prisma.portfolioReviewItem.count({ where: { status: "open" } }),
    prisma.portfolioImportBatch.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
    prisma.positionSnapshot.findFirst({ orderBy: { asOf: "desc" }, select: { asOf: true } }),
  ]);
  const empty = ds.trades.length === 0 || Object.keys(ds.prices).length === 0;
  const ctx = buildContext(ds);
  const book = empty ? { open: [], disposals: [] } : buildLots(ds);
  const today = new Date().toISOString().slice(0, 10);
  const ageDays = (d: string) => Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
  const positionsAsOf = snap ? snap.asOf.toISOString().slice(0, 10) : null;
  const v: PortfolioData = {
    ds, ctx, book, empty,
    health: {
      pricesAsOf: ctx.asof, positionsAsOf, lastBatchAt: lastBatch?.startedAt ?? null, recon, reconOk: recon.filter((r) => r.ok).length, openReviews,
      stalePrices: !empty && ageDays(ctx.asof) > 4, staleSnapshot: positionsAsOf ? ageDays(positionsAsOf) > 4 : true,
    },
  };
  memo = { at: Date.now(), v };
  return v;
}
