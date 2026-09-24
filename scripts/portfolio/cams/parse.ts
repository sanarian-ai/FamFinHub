// PDF entry point for the CAMS/KFintech Consolidated Account Statement parser (camsParser.ts).
// Deterministic: shells out to `pdftotext -layout` (exact text extraction, no OCR) and hands the
// result to the pure parser, so re-running this on the same PDF always produces byte-identical
// output — safe to re-run on every periodic statement upload.
//
// Usage: npx tsx scripts/portfolio/cams/parse.ts <path-to-cas.pdf> [output-dir]
// Writes <output-dir>/ingest_payload.json (default: prisma/seed-data/portfolio/cams/<asOfDate>/).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseCamsStatement } from "../../../src/lib/portfolio/camsParser";

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("usage: npx tsx scripts/portfolio/cams/parse.ts <path-to-cas.pdf> [output-dir]");
  process.exit(1);
}
if (!fs.existsSync(pdfPath)) {
  console.error(`file not found: ${pdfPath}`);
  process.exit(1);
}

const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], { maxBuffer: 50 * 1024 * 1024 }).toString("utf8");
const result = parseCamsStatement(text);

if (result.warnings.length) {
  console.log(`${result.warnings.length} warning(s) — rows that could not be confidently classified (nothing silently dropped):`);
  for (const w of result.warnings) console.log(`  [${w.folio ?? "?"}] ${w.reason} | ${w.line.trim()}`);
}

const outDir = process.argv[3] ?? path.join("prisma", "seed-data", "portfolio", "cams", result.summary.asOfDate ?? "unknown-date");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "ingest_payload.json");

const payload = {
  source: "cams_cas_pdf",
  notes: `CAMS/KFintech Consolidated Account Statement, as of ${result.summary.asOfDate}, parsed from ${path.basename(pdfPath)}.`,
  securities: result.securities,
  accounts: result.accounts, // not part of ingestPortfolio's schema — consumed by seed.ts to upsert PortfolioAccount rows first
  transactions: result.transactions.map(({ meta, ...t }) => t), // meta is parse-time provenance only, dropped before ingest
  positionSnapshots: result.positionSnapshots,
  prices: result.prices,
};
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

console.log(`accounts (folios) ${result.accounts.length}, securities ${result.securities.length}, transactions ${result.transactions.length}, positionSnapshots ${result.positionSnapshots.length}, prices ${result.prices.length}`);
console.log(`totalCostValue ${result.summary.totalCostValue.toFixed(2)}, totalMarketValue ${result.summary.totalMarketValue.toFixed(2)}, asOfDate ${result.summary.asOfDate}`);
console.log(`written -> ${outPath}`);
