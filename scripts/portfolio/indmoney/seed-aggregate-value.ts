import { readFileSync } from "node:fs";
import { prisma } from "../../../src/lib/prisma";

/**
 * Seeds a value-only position — used for holdings the INDmoney MCP reports only as a rolled-up
 * total, with no unit-level data at all (verified for EPF and NPS: total_units/unit_price/broker
 * are all null on every row). Creates the account (broker: RETIREMENT_TRACKED) and security
 * (kind: AGGREGATE_VALUE) if missing. Position qty is fixed at 1; PriceDaily.close carries the
 * whole INR value. Both the broker and security kind are excluded from the Yahoo Finance
 * price-refresh job (route.ts filters to STOCK/ETF only), so this value is never silently
 * overwritten by that job — it only changes when this script is re-run.
 *
 * The MCP is only reachable from a live Claude session, not the app's own server — same
 * session-driven refresh model as seed-holdings.ts, no self-serve button.
 *
 * Usage: npx tsx scripts/portfolio/indmoney/seed-aggregate-value.ts <payload.json>
 * Payload: [{ account, accountName, holder, security, securityName, asOf, valueINR }, ...]
 */
type Row = {
  account: string;
  accountName: string;
  holder: string;
  security: string;
  securityName: string;
  asOf: string;
  valueINR: number;
};

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: seed-aggregate-value.ts <payload.json>");
  const rows = JSON.parse(readFileSync(path, "utf8")) as Row[];

  for (const r of rows) {
    const acc = await prisma.portfolioAccount.upsert({
      where: { key: r.account },
      create: { key: r.account, broker: "RETIREMENT_TRACKED", name: r.accountName, holder: r.holder, baseCurrency: "INR" },
      update: { name: r.accountName },
    });
    const sec = await prisma.security.upsert({
      where: { symbol: r.security },
      create: { symbol: r.security, name: r.securityName, kind: "AGGREGATE_VALUE", currency: "INR" },
      update: { name: r.securityName },
    });
    await prisma.positionSnapshot.upsert({
      where: { accountId_securityId_asOf: { accountId: acc.id, securityId: sec.id, asOf: new Date(r.asOf) } },
      create: { accountId: acc.id, securityId: sec.id, asOf: new Date(r.asOf), qty: 1, source: "indmoney_mcp" },
      update: { qty: 1, source: "indmoney_mcp" },
    });
    await prisma.priceDaily.upsert({
      where: { securityId_date: { securityId: sec.id, date: new Date(r.asOf) } },
      create: { securityId: sec.id, date: new Date(r.asOf), close: r.valueINR, source: "indmoney_mcp" },
      update: { close: r.valueINR, source: "indmoney_mcp" },
    });
    console.log(`${r.account}: qty=1 @ Rs.${r.valueINR} (asOf ${r.asOf})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
