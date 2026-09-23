/**
 * Seeds the 13 "net worth by asset class" baseline items (group: netWorth), once, from the
 * user's personal net-worth tracking sheet (Summary Asset Allocation section, snapshot read
 * 2026-09-22). Idempotent: upserts by (planId, key), so re-running only touches values that
 * changed here in code — it never overwrites a value the user has since edited in the UI, because
 * it only runs at all when the row doesn't exist yet (existing rows are skipped, not overwritten).
 * Run: npx tsx scripts/retirement/seed-networth.ts ["Plan name"]
 */
import { PrismaClient } from "@prisma/client";
import { NETWORTH_CLASSES } from "../../src/lib/retirement";

/* eslint-disable @typescript-eslint/no-explicit-any */
const prisma: any = new PrismaClient();

// ₹L (lakhs), from the Summary Asset Allocation block of the user's sheet, snapshot 2026-09-22.
// Sources noted per row; the two live-wired classes (intlEquity, pms) are overwritten by their
// own data provider the first time the user clicks "Use live value" on the baseline screen.
const SEED_VALUES: Record<string, number> = {
  "networth.mutualFunds": 301.7922,     // Investment Sheet Total Overview: Total MF current value ₹30,179,222
  "networth.indianEquity": 78.4745,     // Stock Portfolio (Fintoo) Grand Total current value ₹7,847,450
  "networth.unlistedNse": 102,          // Summary Asset Allocation: Unlisted Shares-NSE total ₹10,200,000
  "networth.intlEquity": 254.8277,      // Summary Asset Allocation: International equity total ₹25,482,768 (seed only — live-wired)
  "networth.pms": 111,                  // Summary Asset Allocation: PMS total ₹11,100,000 (seed only — live-wired)
  "networth.commodities": 50.4995,      // Summary Asset Allocation: Commodities total ₹5,049,954 (Gold/Silver ETF)
  "networth.epfNps": 69.2056,           // Summary Asset Allocation: EPF & NPS total ₹6,920,564
  "networth.fd": 0,                     // Summary Asset Allocation: Fixed Deposits total ₹0
  "networth.cash": 50,                  // Summary Asset Allocation: Cash total ₹5,000,000
  "networth.realEstate": 200,           // Summary Asset Allocation: Real estate total ₹20,000,000
  "networth.futureGenerali": 50,        // Summary Asset Allocation: Future Generali total ₹5,000,000
  "networth.esops": 1260,               // Summary Asset Allocation: ESOPS total ₹126,000,000
  "networth.bitcoin": 16.6008,          // Summary Asset Allocation: BitCoin total ₹1,660,080
};

async function main() {
  const name = process.argv[2] ?? "Household retirement plan";
  const plan = await prisma.retirementPlan.findFirst({ where: { name, archivedAt: null } });
  if (!plan) { console.error(`No plan named "${name}" found.`); process.exit(1); }

  let created = 0, skipped = 0;
  for (const cls of NETWORTH_CLASSES) {
    const existing = await prisma.retirementBaselineItem.findUnique({
      where: { planId_key: { planId: plan.id, key: cls.key } },
    });
    if (existing) { skipped++; continue; }
    const valueL = SEED_VALUES[cls.key];
    if (valueL === undefined) throw new Error(`No seed value for ${cls.key}`);
    await prisma.retirementBaselineItem.create({
      data: {
        planId: plan.id, key: cls.key, label: cls.label, group: "netWorth", unit: "lump",
        valueL, sortOrder: 200 + cls.sortOrder,
      },
    });
    created++;
  }
  console.log(`Net worth seed: ${created} created, ${skipped} already present (unchanged).`);
  const total = await prisma.retirementBaselineItem.count({ where: { planId: plan.id, group: "netWorth" } });
  console.log(`Plan ${plan.id} now has ${total} netWorth items (expect 13).`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
