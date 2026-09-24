// Free, unofficial daily NAV feed for mutual fund securities (AMFI's own published NAVAll.txt —
// the same file every fund tracker and RTA portal ultimately reads from). No API key, no SLA:
// mirrors priceFeed.ts's contract exactly — never throws, a security AMFI doesn't cover returns
// no entry, and the caller leaves that security's existing last-known price untouched.
//
// Matching key is the ISIN, not a scheme-code or name — see camsParser.ts for why every CAMS-
// sourced MUTUAL_FUND Security's symbol already *is* its ISIN. A scheme can carry two ISINs (a
// "Div Payout/Growth" one and a separate "Div Reinvestment" one); either is checked.
//
// Format (semicolon-delimited, undocumented but stable for years):
//   Scheme Code;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Scheme Name;Plan;Option;NAV;Date
// interleaved with blank lines and bare category/AMC header lines that don't split into 8 fields.

const NAV_ALL_URL = "https://www.amfiindia.com/spages/NAVAll.txt";

const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
function isoDate(dmy: string): string | null {
  const m = dmy.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mm = MONTHS[m[2]];
  return mm ? `${m[3]}-${mm}-${m[1]}` : null;
}

export type AmfiNav = { isin: string; nav: number; date: string; schemeName: string };

/** Fetches and parses the full AMFI NAV file once, keyed by ISIN (every ISIN a scheme carries maps to the same row). */
export async function fetchAmfiNavs(): Promise<Map<string, AmfiNav>> {
  const out = new Map<string, AmfiNav>();
  let text: string;
  try {
    const res = await fetch(NAV_ALL_URL, { headers: { "User-Agent": "Mozilla/5.0 (compatible; FamilyFinanceHub/1.0)" }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return out;
    text = await res.text();
  } catch {
    return out; // network error, timeout — same "nothing this run" outcome as any other miss
  }

  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(";");
    if (parts.length < 8) continue; // blank lines and bare category/AMC header lines
    const [, isinGrowth, isinReinvest, schemeName, , , navStr, dateStr] = parts;
    const nav = Number(navStr);
    const date = isoDate(dateStr);
    if (!Number.isFinite(nav) || nav <= 0 || !date) continue; // "N.A." NAV rows, malformed dates
    const entry: AmfiNav = { isin: isinGrowth, nav, date, schemeName: schemeName.trim() };
    for (const isin of [isinGrowth, isinReinvest]) {
      if (isin && isin !== "-" && /^[A-Z0-9]{12}$/.test(isin)) out.set(isin, entry);
    }
  }
  return out;
}
