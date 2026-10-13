// Read-only: dumps the full DB rows for the "likely" tier surplus (deleteIds) so a delete can be undone.
// Usage: npx tsx scripts/ledger/backup-duplicates.ts [outfile.json]
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { findDuplicateClusters } from "../../src/lib/dedupeReview";

async function main() {
  const out = process.argv[2] ?? "_backups/likely-duplicates.json";
  const prisma = new PrismaClient();
  const clusters = (await findDuplicateClusters(prisma)).filter((c) => c.tier === "likely");
  const ids = clusters.flatMap((c) => c.deleteIds);
  const rows = await prisma.transaction.findMany({ where: { id: { in: ids } }, include: { fundingLinks: true } });
  const linked = rows.filter((r) => r.fundingLinks.length > 0).length;
  writeFileSync(out, JSON.stringify({ createdAt: new Date().toISOString(), groups: clusters.length, ids, rows }, (_, v) => (typeof v === "bigint" ? v.toString() : v), 1));
  console.log(`wrote ${out}: ${clusters.length} groups, ${ids.length} ids, ${rows.length} rows fetched, ${linked} funding-linked (will be skipped on delete)`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
