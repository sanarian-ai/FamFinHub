// One-time CoinDCX ingestion: creates the COINDCX_SANGEETH account + BTC/ETH securities, backfills
// daily prices, and ingests the 8 filled orders from Order_history.csv (all BUY, no SELL yet).
// Idempotent: safe to re-run (createMany/skipDuplicates for accounts+securities, ingestPortfolio's
// own source+brokerRef idempotency for transactions, security+date idempotency for prices).
//
// Price backfill: CoinGecko's free /market_chart/range only serves the last 365 days from "now"
// (confirmed empirically 2026-09-26, error_code 10012 for anything older) — so this backfills full
// daily closes for [today-365d, today] and, for the 4 trades older than that window, adds a single
// PriceDaily mark at each trade's own date using its own execution price (same trade-price-derived
// pattern the IIFL ingestion used — see india-portfolio-build-brief.md). Run: npx tsx
// scripts/portfolio/coindcx/seed.ts [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { ingestPortfolio } from "@/lib/portfolio/ingest";

const prisma = new PrismaClient();
const DRY = process.argv.includes("--dry-run");

const COINGECKO_ID: Record<string, string> = { BTC: "bitcoin", ETH: "ethereum" };
const SYMBOL_NAME: Record<string, string> = { BTC: "Bitcoin", ETH: "Ethereum" };

type OrderRow = {
  orderId: string; pair: string; qty: number; avgPrice: number; fee: number; side: string; status: string; createdAt: string;
};

function parseCsv(): OrderRow[] {
  const p = path.join(process.cwd(), "scripts", "portfolio", "coindcx", "Order_history.csv");
  const lines = fs.readFileSync(p, "utf8").trim().split("\n");
  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);
  const rows: OrderRow[] = [];
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    rows.push({
      orderId: c[idx("Order ID")],
      pair: c[idx("Market")], // "BTCINR" / "ETHINR"
      qty: Number(c[idx("Total Quantity")]),
      avgPrice: Number(c[idx("Avg Price")]),
      fee: Number(c[idx("Fee Amount")]),
      side: c[idx("Side")],
      status: c[idx("Status")],
      createdAt: c[idx("Created At")], // "2026-02-02 03:59:55 UTC"
    });
  }
  return rows;
}

function toIso(createdAt: string): string {
  // "2026-02-02 03:59:55 UTC" -> "2026-02-02T03:59:55Z"
  return createdAt.replace(" UTC", "Z").replace(" ", "T");
}

async function backfillPrices(symbols: string[]): Promise<{ symbol: string; date: string; close: number }[]> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 365 * 86400 + 3600; // small buffer inside the 365d window
  const out: { symbol: string; date: string; close: number }[] = [];
  for (const symbol of symbols) {
    const id = COINGECKO_ID[symbol];
    const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart/range?vs_currency=inr&from=${from}&to=${now}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      console.error(`  ${symbol}: backfill fetch failed (${res.status})`);
      continue;
    }
    const body = await res.json();
    const prices: [number, number][] = body.prices ?? [];
    const byDate = new Map<string, number>();
    for (const [ms, close] of prices) {
      const date = new Date(ms).toISOString().slice(0, 10);
      byDate.set(date, close); // last point of the day wins if there are >1 (there aren't, at daily granularity)
    }
    for (const [date, close] of byDate) out.push({ symbol, date, close });
    console.log(`  ${symbol}: ${byDate.size} daily closes from CoinGecko (${[...byDate.keys()].sort()[0]} -> ${[...byDate.keys()].sort().at(-1)})`);
  }
  return out;
}

async function main() {
  const orders = parseCsv().filter((o) => o.status === "filled");
  console.log(`Parsed ${orders.length} filled orders from Order_history.csv`);

  const bySymbol = (pair: string): "BTC" | "ETH" | null => (pair === "BTCINR" ? "BTC" : pair === "ETHINR" ? "ETH" : null);
  const symbols = [...new Set(orders.map((o) => bySymbol(o.pair)).filter((s): s is "BTC" | "ETH" => s != null))];
  console.log("Symbols:", symbols);

  // 1. Account — created regardless of --dry-run (no financial data, safe/idempotent) so the
  // ingestPortfolio dry-run below actually validates transactions against a real account, not
  // an "unknown account" rejection.
  const ACCOUNT_KEY = "COINDCX_SANGEETH";
  await prisma.portfolioAccount.upsert({
    where: { key: ACCOUNT_KEY },
    create: { key: ACCOUNT_KEY, broker: "COINDCX", name: "CoinDCX (Sangeeth)", holder: "Sangeeth", baseCurrency: "INR", isActive: true },
    update: {},
  });
  console.log(`Account ${ACCOUNT_KEY} ready.`);

  // 2. Securities (create-if-missing via ingestPortfolio's own securities[] handling below)
  const securities = symbols.map((s) => ({ symbol: s, name: SYMBOL_NAME[s], kind: "CRYPTO" as const, currency: "INR" }));

  // 3. Price backfill: full daily range (last 365d) + trade-price marks for anything older
  console.log("Backfilling daily prices from CoinGecko...");
  const dailyPrices = await backfillPrices(symbols);
  const dailyDates = new Set(dailyPrices.map((p) => `${p.symbol}|${p.date}`));
  const tradePrices: { symbol: string; date: string; close: number }[] = [];
  for (const o of orders) {
    const symbol = bySymbol(o.pair);
    if (!symbol) continue;
    const date = toIso(o.createdAt).slice(0, 10);
    const key = `${symbol}|${date}`;
    if (!dailyDates.has(key) && !tradePrices.some((p) => `${p.symbol}|${p.date}` === key)) {
      tradePrices.push({ symbol, date, close: o.avgPrice });
    }
  }
  console.log(`Trade-price-derived marks for dates outside the 365d window: ${tradePrices.length}`, tradePrices.map((p) => `${p.symbol}@${p.date}`));

  // 4. Transactions
  const transactions = orders
    .filter((o) => o.side === "buy")
    .map((o) => {
      const symbol = bySymbol(o.pair);
      if (!symbol) return null;
      return {
        account: ACCOUNT_KEY,
        symbol,
        side: "BUY" as const,
        qty: o.qty,
        price: o.avgPrice,
        fee: o.fee,
        execTs: toIso(o.createdAt),
        source: "coindcx_order_history" as const,
        brokerRef: o.orderId,
      };
    })
    .filter((t): t is NonNullable<typeof t> => t != null);

  console.log(`Built ${transactions.length} transaction rows, ${securities.length} securities, ${dailyPrices.length + tradePrices.length} price rows.`);

  const payload = {
    securities,
    prices: [...dailyPrices, ...tradePrices],
    transactions,
    source: "coindcx_order_history" as const,
    notes: "CoinDCX Order_history.csv, uploaded 2026-09-26 — full crypto channel onboarding",
  };

  console.log("\n--- DRY RUN ---");
  const dry = await ingestPortfolio(prisma, { ...payload, dryRun: true });
  console.log(JSON.stringify(dry, null, 2));

  if (DRY) {
    console.log("\n--dry-run flag set, stopping here.");
    return;
  }

  console.log("\n--- LIVE INGEST ---");
  const live = await ingestPortfolio(prisma, payload);
  console.log(JSON.stringify(live, null, 2));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
