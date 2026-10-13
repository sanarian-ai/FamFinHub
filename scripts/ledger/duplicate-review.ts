// Read-only: writes a CSV of possible duplicate transaction groups for offline review.
// Usage: npx tsx scripts/ledger/duplicate-review.ts [outfile.csv]
import { writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { findDuplicateClusters } from "../../src/lib/dedupeReview";

const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

async function main() {
  const out = process.argv[2] ?? "duplicate-review.csv";
  const prisma = new PrismaClient();
  const clusters = await findDuplicateClusters(prisma);
  const header = ["tier", "group", "date", "amount", "account", "suggested_action", "source", "status", "category", "added", "description", "transaction_id", "note"];
  const lines = [header.join(",")];
  clusters.forEach((c, i) => {
    for (const r of c.rows) {
      lines.push([
        c.tier, i + 1, String(c.date).slice(0, 10), c.amount, c.accountName ?? "",
        r.id === c.keepId ? "KEEP" : "DELETE?", r.source, r.status, r.categoryName ?? "",
        String(r.createdAt).slice(0, 10), r.description, r.id, c.note ?? "",
      ].map(esc).join(","));
    }
  });
  writeFileSync(out, lines.join("\n") + "\n");
  console.log(`wrote ${out}: ${clusters.length} groups, ${lines.length - 1} rows`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
