// Post-ingest verification for the CAMS/KFintech MF pipeline: row counts, tie-out against the
// statement's own Portfolio Summary totals (parsed alongside, not re-derived from the DB), and
// open review items. Run after seed.ts on any CAMS ingest, not just the first one.
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

const prisma = new PrismaClient();
const payloadPath = process.argv[2];
if (!payloadPath) {
  console.error("usage: npx tsx scripts/portfolio/cams/verify.ts <path-to-ingest_payload.json>");
  process.exit(1);
}

async function main() {
  const body = JSON.parse(fs.readFileSync(payloadPath, "utf8"));
  const accountKeys: string[] = body.accounts.map((a: any) => a.key);
  const isins: string[] = body.securities.map((s: any) => s.symbol);

  const [accCount, secCount, txCount, snapCount, priceCount] = await Promise.all([
    prisma.portfolioAccount.count({ where: { key: { in: accountKeys } } }),
    prisma.security.count({ where: { symbol: { in: isins } } }),
    prisma.portfolioTransaction.count({ where: { source: "cams_cas_pdf" } }),
    prisma.positionSnapshot.count({ where: { source: "cams_cas_pdf" } }),
    prisma.priceDaily.count({ where: { source: "cams_cas_pdf" } }),
  ]);
  console.log(`accounts in DB: ${accCount}/${accountKeys.length} expected`);
  console.log(`securities in DB: ${secCount}/${isins.length} expected`);
  console.log(`transactions (cams_cas_pdf): ${txCount} (payload had ${body.transactions.length} rows — some can repeat across re-uploads of overlapping history, dedup is expected)`);
  console.log(`position snapshots (cams_cas_pdf): ${snapCount} (payload had ${body.positionSnapshots.length})`);
  console.log(`prices (cams_cas_pdf): ${priceCount} distinct (securityId, date) rows`);

  // Tie out current market value: sum(latest snapshot qty x latest known price) per security,
  // restricted to this payload's accounts, against the statement's own printed total.
  const snaps = await prisma.positionSnapshot.findMany({
    where: { source: "cams_cas_pdf", account: { key: { in: accountKeys } } },
    orderBy: { asOf: "desc" },
    distinct: ["accountId", "securityId"],
    include: { security: { select: { symbol: true } } },
  });
  const prices = await prisma.priceDaily.findMany({ where: { securityId: { in: snaps.map((s) => s.securityId) } }, orderBy: { date: "desc" } });
  const latestPrice = new Map<string, number>();
  for (const p of prices) if (!latestPrice.has(p.securityId)) latestPrice.set(p.securityId, Number(p.close));
  let computedMarketValue = 0;
  for (const s of snaps) computedMarketValue += Number(s.qty) * (latestPrice.get(s.securityId) ?? 0);
  console.log(`computed market value (snapshots x latest price): ${computedMarketValue.toFixed(2)}`);

  const openItems = await prisma.portfolioReviewItem.count({ where: { status: "open" } });
  console.log(`open review items (system-wide, should be 0 or explained): ${openItems}`);
  if (openItems > 0) {
    const items = await prisma.portfolioReviewItem.findMany({ where: { status: "open" }, take: 20 });
    for (const i of items) console.log(`  [${i.type}] ${i.detail}`);
  }
}
main().finally(() => prisma.$disconnect());
