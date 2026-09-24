// One-off: gives each of the 4 closed-vehicle synthetic securities a single PriceDaily row at 0,
// dated the day after its last transaction — the only fix engine.run()'s px[symbol][i] lookup
// needs (buildContext()'s ffill() then fills the entire date range with that one value, both
// forward and backward — see india-data.ts's `lotAccounts` comment for why buildLots() still
// excludes these four regardless). Correctly represents "closed, no remaining marked value": XIRR
// itself comes from the dated BUY/SELL cashflows, never from this price, since V0/V1 for these
// accounts round to 0 either way (no real "position" to mark).
import { PrismaClient } from "@prisma/client";
import { ingestPortfolio } from "../../../src/lib/portfolio/ingest";

const prisma = new PrismaClient();

const PRICES = [
  { symbol: "KCV-RIA", date: "2024-12-01" }, // day after last KCV txn (2024-11-30)
  { symbol: "KFV-RIA", date: "2024-12-01" }, // day after last KFV txn (2024-11-30)
  { symbol: "UNIFI-BLN", date: "2025-11-05" }, // day after last BLN txn (2025-11-04)
  { symbol: "UNIFI-BCAD20", date: "2025-11-05" }, // day after last BCAD20 txn (2025-11-04)
];

async function main() {
  const prices = PRICES.map((p) => ({ symbol: p.symbol, date: p.date, close: 0.01, priceSource: "closed_vehicle_zero_mark" }));
  const result = await ingestPortfolio(prisma, { prices });
  console.log("prices:", result.results.prices);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
