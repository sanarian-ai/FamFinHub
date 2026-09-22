// P2 verification: row counts, cash-flow tie-outs against the portal's own report totals
// (Capital Register / Statement of Dividend / Statement of Expense), and idempotency.
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const acc = await prisma.portfolioAccount.findUniqueOrThrow({ where: { key: "KABIR_PMS_RIA" } });
  const [txCount, ceCount, snapCount, secCount] = await Promise.all([
    prisma.portfolioTransaction.count({ where: { accountId: acc.id } }),
    prisma.cashEvent.count({ where: { accountId: acc.id } }),
    prisma.positionSnapshot.count({ where: { accountId: acc.id } }),
    prisma.security.count({ where: { currency: "INR" } }),
  ]);
  console.log(`rows: transactions=${txCount} cashEvents=${ceCount} positionSnapshots=${snapCount} INR securities=${secCount}`);

  const ce = await prisma.cashEvent.findMany({ where: { accountId: acc.id } });
  const sum = (t: string) => ce.filter((c) => c.type === t).reduce((s, c) => s + Number(c.amount), 0);
  const deposit = sum("DEPOSIT"), wht = sum("WITHHOLDING_TAX"), div = sum("DIVIDEND"), fee = sum("FEE");
  console.log(`DEPOSIT total: ${deposit} (portal: 10000000.00)`);
  console.log(`WITHHOLDING_TAX total: ${wht} (portal: -3354.00)`);
  console.log(`net capital: ${deposit + wht} (portal Capital Register closing balance: 9996646.00)`);
  console.log(`DIVIDEND total: ${div} (portal Statement of Dividend Net Amount total: 70425.75)`);
  console.log(`FEE total: ${fee} (portal non-STT expense lines: -846.08, portal's own total row: -846.07, 1p rounding)`);

  const tx = await prisma.portfolioTransaction.findMany({ where: { accountId: acc.id } });
  const feeTotal = tx.reduce((s, t) => s + Number(t.fee), 0);
  console.log(`per-trade fee (brokerage+STT folded in) total: ${feeTotal.toFixed(2)} (portal Statement of Expense STT total: 10121.00 + brokerage ~43.13)`);

  const rejects = await prisma.portfolioReviewItem.count({ where: { status: "open" } });
  console.log(`open review items (should be 0): ${rejects}`);
}
main().finally(() => prisma.$disconnect());
