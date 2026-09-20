// M1 seed for US portfolio tracking. Idempotent: every insert is createMany({ skipDuplicates }) in
// small chunks (Render/Supabase are slow, pool is 5). Run: npx tsx scripts/portfolio/seed.ts
import { PrismaClient, Prisma } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const prisma = new PrismaClient();
const dir = path.join(process.cwd(), "prisma", "seed-data", "portfolio");
const load = <T>(n: string): T => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), "utf8"));
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const chunks = <T>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  const accounts = load<any[]>("accounts");
  const securities = load<any[]>("securities");
  const actions = load<any[]>("corporate_actions");
  const txs = load<any[]>("transactions");
  const snaps = load<any[]>("position_snapshots");
  const prices = load<any[]>("prices_daily");
  const fx = load<any[]>("fx_daily");

  await prisma.portfolioAccount.createMany({ data: accounts, skipDuplicates: true });
  await prisma.security.createMany({ data: securities, skipDuplicates: true });
  const accId = new Map((await prisma.portfolioAccount.findMany()).map((a) => [a.key, a.id]));
  const secId = new Map((await prisma.security.findMany()).map((s) => [s.symbol, s.id]));

  await prisma.corporateAction.createMany({
    data: actions.map((a) => ({ securityId: secId.get(a.symbol)!, type: a.type, effectiveDate: d(a.effectiveDate), ratio: new Prisma.Decimal(a.ratio), source: a.source })),
    skipDuplicates: true,
  });

  const batch = await prisma.portfolioImportBatch.create({ data: { source: "indmoney_report", rowsIn: txs.length, notes: "M1 seed: INDmoney Trade Report (2019-01-01..2026-09-20) + 7 IBKR trades" } });
  let inserted = 0;
  for (const c of chunks(txs, 50)) {
    const r = await prisma.portfolioTransaction.createMany({
      data: c.map((t) => ({
        accountId: accId.get(t.account)!, securityId: secId.get(t.symbol)!, side: t.side,
        qty: new Prisma.Decimal(t.qty), price: new Prisma.Decimal(t.price), fee: new Prisma.Decimal(t.fee),
        execTs: new Date(t.execTs), tradeDate: d(t.tradeDate), source: t.source, brokerRef: t.brokerRef, importBatchId: batch.id,
      })),
      skipDuplicates: true,
    });
    inserted += r.count;
  }
  await prisma.portfolioImportBatch.update({ where: { id: batch.id }, data: { status: "completed", finishedAt: new Date(), rowsInserted: inserted, rowsSkipped: txs.length - inserted } });

  await prisma.positionSnapshot.createMany({
    data: snaps.map((s) => ({ accountId: accId.get(s.account)!, securityId: secId.get(s.symbol)!, asOf: d(s.asOf), qty: new Prisma.Decimal(s.qty), source: s.source })),
    skipDuplicates: true,
  });
  for (const c of chunks(prices, 500)) {
    await prisma.priceDaily.createMany({
      data: c.map((p) => ({ securityId: secId.get(p.symbol)!, date: d(p.date), close: new Prisma.Decimal(p.close), dividendPerShare: p.dividendPerShare != null ? new Prisma.Decimal(p.dividendPerShare) : null, source: p.source })),
      skipDuplicates: true,
    });
  }
  for (const c of chunks(fx, 500)) {
    await prisma.fxDaily.createMany({ data: c.map((f) => ({ date: d(f.date), pair: f.pair, rate: new Prisma.Decimal(f.rate), source: f.source })), skipDuplicates: true });
  }
  console.log(`transactions inserted this run: ${inserted}/${txs.length}`);
}
main().finally(() => prisma.$disconnect());
