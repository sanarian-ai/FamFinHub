// Backfills historical NAV history for the 24 CAMS-ingested mutual fund securities (kind:
// MUTUAL_FUND, symbol = ISIN, broker MF_FOLIO). Before this script ran, each security had exactly
// one PriceDaily row (today's NAV, from the existing AMFI-refresh path in amfiNav.ts / the
// "Refresh NAVs" button on /portfolio/india/mf) — fine for a current-value snapshot, but engine.ts's
// ffill() would have backfilled that single value across the ENTIRE date range for any run() call,
// making every period-cut return (1M/3M/.../1Y) and the value-vs-benchmark chart meaningless (they'd
// compare "today's NAV" against "today's NAV" at every past date). Since-inception IRR was NOT
// affected by this (it only needs real cash flows + today's real ending value, both already
// correct) — this script is specifically what step 5's Performance tab needs for its period cuts
// and chart, per Sangeeth's explicit choice to source real history first rather than ship a
// reduced since-inception-only Performance tab.
//
// Source: mfapi.in (https://api.mfapi.in/mf/<AMFI scheme code>) — a free, unofficial JSON mirror of
// AMFI's own daily NAV history, keyed by AMFI scheme code (not ISIN). The ISIN->scheme-code mapping
// comes from AMFI's own NAVAll.txt (https://www.amfiindia.com/spages/NAVAll.txt, redirects to
// portal.amfiindia.com) — same file amfiNav.ts already parses for today's NAV, just using the
// "Scheme Code" field that file currently discards. Both sources confirmed reachable directly (no
// Akamai-style blocking like niftyindices.com needed in step 1).
//
// Scoped to each security's own [first transaction date - 30 days, today] window rather than full
// scheme history (some go back to 2013) — keeps row counts reasonable and matches what the engine
// actually needs (nothing before a security's own first trade is ever read).
import { PrismaClient } from "@prisma/client";
import { ingestPortfolio, MAX_ROWS } from "../../../src/lib/portfolio/ingest";

const prisma = new PrismaClient();

const ISIN_TO_SCHEME_CODE: Record<string, string> = {
  INF209K01VP1: "119526", INF846K01CX4: "120389", INF194KB1AL4: "147946", INF740K01PU7: "119247",
  INF754K01OX5: "150581", INF754K01ML4: "142388", INF179KA1KT6: "129052", INF179K01XT4: "119128",
  INF109K016O4: "120364", INF109K015K4: "120334", INF109K016L0: "120586", INF109KC1RH9: "145897",
  INF205K01MV6: "120403", INF174K01LT0: "119775", INF174K01LC6: "119771", INF204K01XZ7: "118585",
  INF879O01027: "122639", INF879O01175: "148958", INF200K01QU0: "119574", INF200K01UP2: "119783",
  INF200K01RA0: "119835", INF789F01XA0: "120716", INF789FC12T1: "143341", INF179K01WA6: "118968",
};

function isoFromDMY(dmy: string): string | null {
  const m = dmy.trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function main() {
  const isins = Object.keys(ISIN_TO_SCHEME_CODE);
  const securities = await prisma.security.findMany({ where: { symbol: { in: isins } }, select: { id: true, symbol: true, name: true } });
  const secBySymbol = new Map(securities.map((s) => [s.symbol, s]));
  console.log(`Securities matched: ${securities.length} / ${isins.length}`);

  const firstTxn = await prisma.portfolioTransaction.groupBy({
    by: ["securityId"],
    where: { securityId: { in: securities.map((s) => s.id) } },
    _min: { tradeDate: true },
  });
  const firstTxnBySecId = new Map(firstTxn.map((r) => [r.securityId, r._min.tradeDate]));

  const today = new Date().toISOString().slice(0, 10);
  type PriceRow = { symbol: string; date: string; close: number; priceSource: string };
  const allPrices: PriceRow[] = [];
  const perSchemeCounts: Record<string, { fetched: number; inWindow: number }> = {};

  for (const isin of isins) {
    const code = ISIN_TO_SCHEME_CODE[isin];
    const sec = secBySymbol.get(isin);
    if (!sec) { console.log(`SKIP ${isin} — no matching Security row`); continue; }
    const firstDate = firstTxnBySecId.get(sec.id);
    if (!firstDate) { console.log(`SKIP ${isin} — no transactions found`); continue; }
    const windowStart = addDaysISO(firstDate.toISOString().slice(0, 10), -30);

    const res = await fetch(`https://api.mfapi.in/mf/${code}`, { headers: { "User-Agent": "Mozilla/5.0 (compatible; FamilyFinanceHub/1.0)" } });
    if (!res.ok) { console.log(`FETCH FAIL ${isin} (${code}): HTTP ${res.status}`); continue; }
    const json = (await res.json()) as { data: { date: string; nav: string }[] };
    const rows = json.data ?? [];
    let inWindow = 0;
    for (const r of rows) {
      const iso = isoFromDMY(r.date);
      const nav = Number(r.nav);
      if (!iso || !Number.isFinite(nav) || nav <= 0) continue;
      if (iso < windowStart || iso > today) continue;
      allPrices.push({ symbol: isin, date: iso, close: nav, priceSource: "mfapi_in" });
      inWindow++;
    }
    perSchemeCounts[isin] = { fetched: rows.length, inWindow };
    console.log(`${isin} (${code}) ${sec.name.slice(0, 40)}: fetched ${rows.length}, in window [${windowStart}..${today}]: ${inWindow}`);
    await new Promise((r) => setTimeout(r, 120));
  }

  console.log(`\nTotal price rows to ingest: ${allPrices.length}`);
  const batches = chunk(allPrices, MAX_ROWS - 100);
  console.log(`Batches: ${batches.length}`);

  let totalInserted = 0, totalSkipped = 0, totalRejected = 0;
  for (const [i, batch] of batches.entries()) {
    const result = await ingestPortfolio(prisma, { prices: batch });
    totalInserted += result.results.prices.inserted;
    totalSkipped += result.results.prices.skipped;
    totalRejected += result.results.prices.rejected.length;
    console.log(`Batch ${i + 1}/${batches.length}: inserted ${result.results.prices.inserted}, skipped ${result.results.prices.skipped}, rejected ${result.results.prices.rejected.length}`);
    if (result.results.prices.rejected.length) console.log(JSON.stringify(result.results.prices.rejected.slice(0, 5), null, 2));
  }
  console.log(`\nTOTAL: inserted ${totalInserted}, skipped (dupe, e.g. today's existing row) ${totalSkipped}, rejected ${totalRejected}`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
