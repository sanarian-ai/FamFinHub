// Benchmark-layer verification: row counts per index, date-range coverage, and spot-checks
// against known values from the source page (see india-portfolio-build-brief.md).
// Run: npx tsx scripts/portfolio/benchmarks/verify.ts
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const EXPECTED: Record<string, { count: number; first: string; firstClose: number; last: string; lastClose: number }> = {
  NIFTY50TRI: { count: 2659, first: "2016-01-01", firstClose: 10598.00, last: "2026-09-24", lastClose: 35044.24 },
  NIFTY500TRI: { count: 2659, first: "2016-01-01", firstClose: 9643.99, last: "2026-09-24", lastClose: 36278.13 },
  NIFMC150TRI: { count: 2659, first: "2016-01-01", firstClose: 5320.72, last: "2026-09-24", lastClose: 28722.40 },
  NIFSC250TRI: { count: 2659, first: "2016-01-01", firstClose: 5392.79, last: "2026-09-24", lastClose: 23193.98 },
};

async function main() {
  const secs = await prisma.security.findMany({ where: { symbol: { in: Object.keys(EXPECTED) } }, select: { id: true, symbol: true, name: true, kind: true, currency: true } });
  console.log(`benchmark securities found: ${secs.length}/4`);
  for (const s of secs) console.log(`  ${s.symbol.padEnd(12)} ${s.name.padEnd(24)} kind=${s.kind} currency=${s.currency}`);

  let ok = true;
  for (const s of secs) {
    const exp = EXPECTED[s.symbol];
    const [count, minRow, maxRow] = await Promise.all([
      prisma.priceDaily.count({ where: { securityId: s.id } }),
      prisma.priceDaily.findFirst({ where: { securityId: s.id }, orderBy: { date: "asc" } }),
      prisma.priceDaily.findFirst({ where: { securityId: s.id }, orderBy: { date: "desc" } }),
    ]);
    const first = minRow?.date.toISOString().slice(0, 10);
    const last = maxRow?.date.toISOString().slice(0, 10);
    const firstClose = minRow ? Number(minRow.close) : NaN;
    const lastClose = maxRow ? Number(maxRow.close) : NaN;
    const countOk = count === exp.count;
    const firstOk = first === exp.first && Math.abs(firstClose - exp.firstClose) < 0.005;
    const lastOk = last === exp.last && Math.abs(lastClose - exp.lastClose) < 0.005;
    const pass = countOk && firstOk && lastOk;
    ok = ok && pass;
    console.log(`${s.symbol.padEnd(12)} count=${count}/${exp.count}${countOk ? "" : " MISMATCH"} first=${first}@${firstClose}${firstOk ? "" : " MISMATCH(exp " + exp.first + "@" + exp.firstClose + ")"} last=${last}@${lastClose}${lastOk ? "" : " MISMATCH(exp " + exp.last + "@" + exp.lastClose + ")"} ${pass ? "OK" : "FAIL"}`);
  }
  const missing = Object.keys(EXPECTED).filter((sym) => !secs.some((s) => s.symbol === sym));
  if (missing.length) { ok = false; console.log(`MISSING SECURITIES: ${missing.join(", ")}`); }

  const openReviews = await prisma.portfolioReviewItem.count({ where: { status: "open", refTable: "prices" } });
  console.log(`open 'prices' review items (should be 0): ${openReviews}`);
  ok = ok && openReviews === 0;

  console.log(ok ? "ALL CHECKS PASSED" : "CHECKS FAILED — see MISMATCH/MISSING lines above");
  if (!ok) process.exitCode = 1;
}
main().finally(() => prisma.$disconnect());
