// Parses the raw NSE Total Returns Index (TRI) CSV dumps in scripts/portfolio/benchmarks/raw/
// (semicolon-delimited "DD Mon YYYY,value" pairs, sourced via Claude-in-Chrome from
// niftyindices.com — see india-portfolio-build-brief.md) into Security (kind: BENCHMARK) +
// PriceDaily rows, through the real ingest path (ingestPortfolio), same pattern as kabir/seed.ts.
// Benchmark set is 4 indices (S&P BSE 500 TRI dropped — see build brief scope decision).
// Run: npx tsx scripts/portfolio/benchmarks/seed.ts
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
import { ingestPortfolio } from "../../../src/lib/portfolio/ingest";

const prisma = new PrismaClient();
const RAW_DIR = path.join(process.cwd(), "scripts", "portfolio", "benchmarks", "raw");

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

const INDICES: { symbol: string; name: string; file: string }[] = [
  { symbol: "NIFTY50TRI", name: "Nifty 50 TRI", file: "nifty50_tri.csv" },
  { symbol: "NIFTY500TRI", name: "Nifty 500 TRI", file: "nifty500_tri.csv" },
  { symbol: "NIFMC150TRI", name: "Nifty Midcap 150 TRI", file: "midcap150_tri.csv" },
  { symbol: "NIFSC250TRI", name: "Nifty Smallcap 250 TRI", file: "smallcap250_tri.csv" },
];

// "24 Sep 2026" -> "2026-09-24"
function toIso(ddMonYyyy: string): string {
  const [dd, mon, yyyy] = ddMonYyyy.trim().split(" ");
  const mm = MONTHS[mon];
  if (!mm || !dd || !yyyy) throw new Error(`unrecognised date "${ddMonYyyy}"`);
  return `${yyyy}-${mm}-${dd.padStart(2, "0")}`;
}

function parseSeries(raw: string): { date: string; close: number }[] {
  const out: { date: string; close: number }[] = [];
  const seen = new Set<string>();
  for (const entry of raw.split(";")) {
    const t = entry.trim();
    if (!t) continue;
    const [dateStr, valStr] = t.split(",");
    if (!dateStr || !valStr) throw new Error(`malformed entry: "${t}"`);
    const date = toIso(dateStr);
    const close = Number(valStr);
    if (!Number.isFinite(close) || close <= 0) throw new Error(`bad close for ${date}: "${valStr}"`);
    if (seen.has(date)) continue; // source has no dupes in practice; guard anyway
    seen.add(date);
    out.push({ date, close });
  }
  return out;
}

async function main() {
  // 1. Create the 4 benchmark securities up front (idempotent, create-if-missing).
  const secResult = await ingestPortfolio(prisma, {
    notes: "NSE Indices TRI benchmark securities (Nifty 50/500/Midcap 150/Smallcap 250 TRI)",
    securities: INDICES.map((i) => ({ symbol: i.symbol, name: i.name, kind: "BENCHMARK", currency: "INR", exchange: "NSE" })),
  });
  console.log("securities:", JSON.stringify(secResult.results.securities));
  if (secResult.results.securities.rejected.length) {
    console.log("SECURITY REJECTS:", JSON.stringify(secResult.results.securities.rejected));
    throw new Error("aborting: one or more benchmark securities failed validation");
  }

  // 2. Ingest each index's full price history as its own call (2,659 rows each, under the 5,000-row cap).
  for (const idx of INDICES) {
    const filePath = path.join(RAW_DIR, idx.file);
    const raw = fs.readFileSync(filePath, "utf8");
    const series = parseSeries(raw);
    const r = await ingestPortfolio(prisma, {
      notes: `${idx.name} daily TRI history, NSE Indices Ltd (niftyindices.com), sourced via Claude-in-Chrome ${new Date().toISOString().slice(0, 10)}`,
      prices: series.map((p) => ({ symbol: idx.symbol, date: p.date, close: p.close, priceSource: "niftyindices_browser" })),
    });
    console.log(`${idx.symbol}: parsed ${series.length} points, first=${series[0]?.date} last=${series[series.length - 1]?.date}`, JSON.stringify(r.results.prices));
    if (r.results.prices.rejected.length) {
      for (const rej of r.results.prices.rejected) console.log(`  REJECTED [${rej.row}]: ${rej.error}`);
    }
  }
}
main().finally(() => prisma.$disconnect());
