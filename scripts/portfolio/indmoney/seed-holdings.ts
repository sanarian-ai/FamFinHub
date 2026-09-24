import { readFileSync } from "node:fs";
import { prisma } from "../../../src/lib/prisma";
import { ingestPortfolio } from "../../../src/lib/portfolio/ingest";

/**
 * Seeds a live position-snapshot pull from the INDmoney MCP connector (broker-tagged holdings,
 * qty only — INDmoney's invested_amount/current_value fields are identical on every row, i.e. it
 * does not track real acquisition cost, so this is a units-only source; cost basis comes from
 * elsewhere, see mf-equity-irr-tracking-proposal.md and the 2026-09-24 evaluation).
 *
 * The MCP is only reachable from a live Claude session, not the app's own server — so unlike the
 * daily automated Yahoo Finance price refresh, this has no self-serve button. It's run by asking
 * Claude to pull the latest INDmoney holdings and re-run this script; not on a schedule.
 *
 * Payload shape (see e.g. 2026-09-24-kabir-holdings.json):
 *   {
 *     "account": "KABIR_PMS_RIA",             // existing PortfolioAccount.key
 *     "asOf": "2026-09-24",                    // YYYY-MM-DD, the date of the INDmoney pull
 *     "securities": [                          // optional — only for symbols not already in the DB
 *       { "symbol": "LT", "name": "Larsen & Toubro Ltd", "kind": "STOCK", "currency": "INR", "exchange": "NSE" }
 *     ],
 *     "holdings": [ { "symbol": "EDELWEISS", "qty": 5156 }, ... ]
 *   }
 *
 * Usage: npx tsx scripts/portfolio/indmoney/seed-holdings.ts <payload.json>
 */
type Payload = {
  account: string;
  asOf: string;
  securities?: { symbol: string; name: string; kind?: string; currency?: string; exchange?: string }[];
  holdings: { symbol: string; qty: number }[];
};

async function main() {
  const path = process.argv[2];
  if (!path) throw new Error("usage: seed-holdings.ts <payload.json>");
  const payload = JSON.parse(readFileSync(path, "utf8")) as Payload;

  const acc = await prisma.portfolioAccount.findUnique({ where: { key: payload.account } });
  if (!acc) throw new Error(`account not found: ${payload.account} (create it first — new brokers need a schema.prisma enum addition)`);

  for (const s of payload.securities ?? []) {
    await prisma.security.upsert({
      where: { symbol: s.symbol },
      create: { symbol: s.symbol, name: s.name, kind: (s.kind as any) ?? "STOCK", currency: s.currency ?? "INR", exchange: s.exchange ?? "NSE" },
      update: { name: s.name },
    });
  }

  const known = new Set((await prisma.security.findMany({ where: { symbol: { in: payload.holdings.map((h) => h.symbol) } }, select: { symbol: true } })).map((s) => s.symbol));
  const missing = payload.holdings.filter((h) => !known.has(h.symbol));
  if (missing.length) {
    console.log("MISSING SECURITIES (add to payload.securities and re-run):", missing);
    return;
  }

  const r = await ingestPortfolio(prisma, {
    notes: `INDmoney MCP holdings pull for ${payload.account}, ${payload.asOf}`,
    positionSnapshots: payload.holdings.map((h) => ({ account: payload.account, symbol: h.symbol, asOf: payload.asOf, qty: h.qty, snapshotSource: "indmoney_mcp" })),
  });
  console.log("positionSnapshots:", JSON.stringify(r.results.positionSnapshots));
  console.log("reviewItemsOpened:", r.reviewItemsOpened);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
