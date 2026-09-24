// Loads a parsed CAMS ingest_payload.json (see parse.ts) into the DB: upserts each folio's
// PortfolioAccount (create-if-missing, matching the Kabir PMS seed pattern), then runs the
// transactions/prices/positionSnapshots through the same validated ingestPortfolio() path the
// periodic scheduled sync and /api/portfolio/ingest route use — so this backfill doubles as a
// test of that path against real, messy CAMS data, and re-running it on an updated statement is
// a safe, idempotent refresh (transactions/cashEvents dedupe on [source, brokerRef]; snapshots and
// prices upsert by their own natural keys).
//
// Usage: npx tsx scripts/portfolio/cams/parse.ts <cas.pdf> && npx tsx scripts/portfolio/cams/seed.ts <payload.json>
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import { ingestPortfolio } from "../../../src/lib/portfolio/ingest";

const prisma = new PrismaClient();
const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("usage: npx tsx scripts/portfolio/cams/seed.ts <path-to-ingest_payload.json>");
  process.exit(1);
}

async function main() {
  console.log(new Date().toISOString(), "start");
  const body = JSON.parse(fs.readFileSync(payloadPath, "utf8"));

  // Chunked concurrency, not fully parallel and not fully sequential — the pooled Supabase
  // connection here has a 5-connection limit, so more than a handful of concurrent upserts just
  // times out acquiring a connection; a handful at a time keeps this fast without exceeding it.
  const accountsIn = body.accounts as { key: string; broker: string; name: string; holder: string; baseCurrency: string }[];
  for (let i = 0; i < accountsIn.length; i += 4) {
    await Promise.all(
      accountsIn.slice(i, i + 4).map((acc) =>
        prisma.portfolioAccount.upsert({
          where: { key: acc.key },
          create: { key: acc.key, broker: acc.broker as any, name: acc.name, holder: acc.holder, baseCurrency: acc.baseCurrency },
          update: { name: acc.name, holder: acc.holder }, // scheme composition of a multi-scheme folio can grow on re-upload
        })
      )
    );
  }

  console.log(new Date().toISOString(), "accounts upserted, starting ingestPortfolio");
  const r = await ingestPortfolio(prisma, {
    source: body.source,
    notes: body.notes,
    securities: body.securities,
    transactions: body.transactions,
    positionSnapshots: body.positionSnapshots,
    prices: body.prices,
    overwrite: true, // prices: a re-uploaded statement's NAV-on-date is a correction, not a dupe to skip
  });

  console.log(new Date().toISOString(), "ingestPortfolio done");
  console.log(`accounts upserted: ${body.accounts.length}`);
  console.log(JSON.stringify({ importBatchId: r.importBatchId, results: Object.fromEntries(Object.entries(r.results).map(([k, v]: any) => [k, { received: v.received, inserted: v.inserted, skipped: v.skipped, rejected: v.rejected.length }])), reviewItemsOpened: r.reviewItemsOpened }, null, 2));
  if (r.reconciliation.length) {
    const bad = r.reconciliation.filter((row) => !row.ok);
    console.log(`reconciliation: ${r.reconciliation.length} positions checked, ${bad.length} mismatched`);
    for (const row of bad) console.log(`  MISMATCH ${row.account}|${row.symbol}: rebuilt ${row.rebuilt} vs snapshot ${row.reported} (diff ${row.diff}) as of ${row.asOf}`);
  }
  for (const [type, res] of Object.entries(r.results) as any) for (const rej of res.rejected) console.log(`REJECTED ${type}[${rej.row}]: ${rej.error}`);
}
main().then(() => { console.log(new Date().toISOString(), "main done, disconnecting"); return prisma.$disconnect(); }).then(() => { console.log(new Date().toISOString(), "disconnected"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
