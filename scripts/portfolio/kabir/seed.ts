// Creates the Kabir PMS account (if missing) and runs the parsed backfill through the real,
// validated ingest path (ingestPortfolio) rather than a bespoke bulk loader — this is the same
// function the ongoing monthly sync (P5) and the /api/portfolio/ingest route will use, so the
// backfill doubles as a test of that path against real, messy broker data.
// Run: npx tsx scripts/portfolio/kabir/parse.ts && npx tsx scripts/portfolio/kabir/seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { ingestPortfolio } from "../../../src/lib/portfolio/ingest";

const prisma = new PrismaClient();
const payloadPath = path.join(process.cwd(), "prisma", "seed-data", "portfolio", "kabir_pms", "ingest_payload.json");

async function main() {
  await prisma.portfolioAccount.upsert({
    where: { key: "KABIR_PMS_RIA" },
    create: {
      key: "KABIR_PMS_RIA", broker: "KABIR_PMS",
      name: "Kabir Capital Advisors LLP - Two Rules Value Fund", holder: "Ria", baseCurrency: "INR",
    },
    update: {},
  });

  const body = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const r = await ingestPortfolio(prisma, body);
  console.log(JSON.stringify({ importBatchId: r.importBatchId, results: Object.fromEntries(Object.entries(r.results).map(([k, v]: any) => [k, { received: v.received, inserted: v.inserted, skipped: v.skipped, rejected: v.rejected.length }])), reviewItemsOpened: r.reviewItemsOpened }, null, 2));
  if (r.reconciliation.length) {
    console.log("reconciliation:");
    for (const row of r.reconciliation) console.log(`  ${row.account}|${row.symbol}: rebuilt ${row.rebuilt} vs snapshot ${row.reported} (diff ${row.diff}) ${row.ok ? "OK" : "MISMATCH"}`);
  }
  for (const [type, res] of Object.entries(r.results) as any) for (const rej of res.rejected) console.log(`REJECTED ${type}[${rej.row}]: ${rej.error}`);
}
main().finally(() => prisma.$disconnect());
