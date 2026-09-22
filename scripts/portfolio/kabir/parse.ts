// Deterministic parser: Kabir Capital PMS portal CSV exports (raw/) -> ingest payload JSON.
// Re-running this on the same raw/ files always produces byte-identical output (no live state,
// no randomness) so it doubles as the monthly-refresh parser once P5 automates the portal pull.
// Internal placeholder symbols only — see MANIFEST.md. Real NSE tickers are a P5 prerequisite.
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "prisma", "seed-data", "portfolio", "kabir_pms", "raw");
const out = path.join(process.cwd(), "prisma", "seed-data", "portfolio", "kabir_pms", "ingest_payload.json");
const ACCOUNT = "KABIR_PMS_RIA";
const SOURCE = "kabir_pms_report";

const n = (s: string) => Number(String(s).replace(/,/g, "").trim());
const iso = (dmy: string) => {
  // dd/mm/yyyy -> yyyy-mm-dd
  const [dd, mm, yyyy] = dmy.trim().split("/");
  return `${yyyy}-${mm}-${dd}`;
};
const parseCsv = (text: string): string[][] => {
  // Minimal RFC4180 parser: handles quoted fields with embedded commas/newlines/escaped quotes.
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x !== "")) rows.push(row); }
  return rows;
};
const read = (file: string) => parseCsv(fs.readFileSync(path.join(dir, file), "utf8"));

// Legal name (exactly as the portal prints it, matched verbatim against the Transaction
// Statement's Security column) -> {symbol, kind}. See MANIFEST.md for the caveat on symbols.
const SECURITIES: Record<string, { symbol: string; kind: "STOCK" | "MUTUAL_FUND" }> = {
  "ALLDIGI TECH LIMITED": { symbol: "ALLDIGI", kind: "STOCK" },
  "Awfis Space Solutions Limited": { symbol: "AWFIS", kind: "STOCK" },
  "Capacite Infraprojects Ltd": { symbol: "CAPACITE", kind: "STOCK" },
  "Cineline India Ltd": { symbol: "CINELINE", kind: "STOCK" },
  "Edelweiss Financial Services Ltd": { symbol: "EDELWEISS", kind: "STOCK" },
  "Edelweiss Liquid Fund Direct Plan Growth Option": { symbol: "EDELLIQ", kind: "MUTUAL_FUND" },
  "HDFC Liquid Fund -Direct Plan - Growth Option": { symbol: "HDFCLIQ", kind: "MUTUAL_FUND" },
  "HERITAGE FOODS LTD": { symbol: "HERITGFOOD", kind: "STOCK" },
  "Hindustan Construction Co.Ltd": { symbol: "HCC", kind: "STOCK" },
  "ICICI Prudential Equity Arbitrage Fund - Direct Plan - Growth": { symbol: "ICICIARB", kind: "MUTUAL_FUND" },
  "Jaro Institute of Technology Management and Research LTD": { symbol: "JARO", kind: "STOCK" },
  "KCP ltd": { symbol: "KCP", kind: "STOCK" },
  "Kamat Hotels India Ltd": { symbol: "KAMATHOTEL", kind: "STOCK" },
  "Kaveri Seed Company Ltd": { symbol: "KSCL", kind: "STOCK" },
  "Monte Carlo Fashions Ltd": { symbol: "MONTECARLO", kind: "STOCK" },
  "NCL Industries Limited": { symbol: "NCLIND", kind: "STOCK" },
  "NUVOCO VISTAS CORPORATION LIMITED": { symbol: "NUVOCO", kind: "STOCK" },
  "ONWARD TECHNOLOGIES LTD.": { symbol: "ONWARDTEC", kind: "STOCK" },
  "ORIENT BELL Ltd": { symbol: "ORIENTBELL", kind: "STOCK" },
  "P.E. Analytics Limited": { symbol: "PEANALYTICS", kind: "STOCK" },
  "PNGS REVA DIAMOND JEWELLERY LIMITED": { symbol: "PNGSREVA", kind: "STOCK" },
  "RPSG VENTURES LTD": { symbol: "RPSGVENT", kind: "STOCK" },
  "Religare Enterprises Ltd": { symbol: "RELIGARE", kind: "STOCK" },
  "S Chand and Company Ltd": { symbol: "SCHAND", kind: "STOCK" },
  "SBI Arbitrage Opportunities Fund - Direct Plan Growth Option": { symbol: "SBIARB", kind: "MUTUAL_FUND" },
  "TRUE COLORS LIMITED": { symbol: "TRUECOLORS", kind: "STOCK" },
  "TeamLease Services Ltd": { symbol: "TEAMLEASE", kind: "STOCK" },
  "Technocraft Industries India Ltd": { symbol: "TECHNOCRAFT", kind: "STOCK" },
};

function symbolOf(name: string): string {
  const hit = SECURITIES[name];
  if (!hit) throw new Error(`unmapped security name from portal CSV: ${JSON.stringify(name)} — add it to SECURITIES in parse.ts`);
  return hit.symbol;
}

const securities = Object.entries(SECURITIES).map(([name, v]) => ({
  symbol: v.symbol, name, kind: v.kind, currency: "INR", exchange: v.kind === "STOCK" ? "NSE" : null,
}));

// ---- Transaction Statement -> transactions[] ----
const txRows = read("G21010015_58171_TransactionStatement_India94OT.csv").filter((r) => /^\d\d\/\d\d\/\d{4}$/.test(r[1] ?? ""));
const refSeen = new Map<string, number>();
const transactions = txRows.map((r) => {
  const [desc, tranDate, , security, , qty, price, brkg, stt] = r;
  const side = desc === "Buy" ? "BUY" : desc === "Sell" ? "SELL" : (() => { throw new Error(`unknown Trans Type ${desc}`); })();
  const symbol = symbolOf(security);
  const tradeDate = iso(tranDate);
  const key = `${tradeDate}:${symbol}:${side}`;
  const dupIdx = refSeen.get(key) ?? 0; refSeen.set(key, dupIdx + 1);
  const brokerRef = `KBR:${tradeDate}:${symbol}:${side}${dupIdx ? `:${dupIdx}` : ""}`;
  return {
    account: ACCOUNT, symbol, side, qty: n(qty), price: n(price), fee: Math.round((n(brkg) + n(stt)) * 100) / 100,
    execTs: `${tradeDate}T10:00:00Z`, tradeDate, source: SOURCE, brokerRef,
  };
});

// ---- Capital Register -> cashEvents[] (deposits, TDS-on-payout debits) ----
const capRows = read("G21010015_58171_CapitalRegister1173OT.csv").filter((r) => /^\d\d\/\d\d\/\d{4}$/.test(r[1] ?? ""));
const capitalEvents = capRows.map((r) => {
  const [desc, tranDate, , notes, credit, debit] = r;
  const eventDate = iso(tranDate);
  if (desc === "Corpus Deposits") {
    return { account: ACCOUNT, type: "DEPOSIT" as const, amount: n(credit), currency: "INR", eventDate, source: SOURCE, brokerRef: `CAPREG:${eventDate}:DEPOSIT`, notes };
  }
  if (desc === "TDS on Payout") {
    return { account: ACCOUNT, type: "WITHHOLDING_TAX" as const, amount: -n(debit), currency: "INR", eventDate, source: SOURCE, brokerRef: `CAPREG:${eventDate}:TDS`, notes };
  }
  throw new Error(`unknown Capital Register row type: ${desc}`);
});

// ---- Statement of Dividend -> cashEvents[] (DIVIDEND) ----
const divAll = read("G21010015_58171_DividendStatement_India177OT.csv");
const divRows = divAll.filter((r) => /^\d\d\/\d\d\/\d{4}$/.test((r[0] ?? "").trim()));
const dividendEvents = divRows.map((r) => {
  const exDate = iso(r[0].trim());
  const receivedDate = r[1] && r[1].trim() ? iso(r[1].trim()) : null;
  const security = r[2].trim();
  const netAmount = n(r[8]);
  const symbol = symbolOf(security);
  const eventDate = receivedDate ?? exDate;
  return {
    account: ACCOUNT, symbol, type: "DIVIDEND" as const, amount: netAmount, currency: "INR", eventDate, source: SOURCE,
    brokerRef: `DIV:${exDate}:${symbol}`, notes: receivedDate ? null : "accrued — not yet received as of 18/09/2026",
  };
});

// ---- Statement of Expense -> cashEvents[] (FEE) — account-level charges only.
// Per-trade STT/brokerage are already folded into transactions[].fee; re-adding them here would
// double-count, so only the non-trade lines (custody, fund-accountant) become FEE events.
const expAll = read("G21010015_58171_Expensestmt546OT.csv");
const feeEvents: any[] = [];
let section = "";
for (const r of expAll) {
  if (r[0] === "Expenses - Paid" || r[0] === "Expenses - Payable") { section = r[0]; continue; }
  if (!/^\d\d\/\d\d\/\d{4}$/.test(r[0] ?? "")) continue;
  const [dateStr, , , detail, desc, amountStr] = r;
  if (detail === "Sec. Tran. Tax") continue; // already in transactions[].fee
  const eventDate = iso(dateStr);
  const amount = n(amountStr);
  feeEvents.push({
    account: ACCOUNT, type: "FEE" as const, amount: -amount, currency: "INR", eventDate, source: SOURCE,
    brokerRef: `EXP:${eventDate}:${detail}:${desc}`.replace(/\s+/g, "_"),
    notes: `${detail} — ${desc}${section === "Expenses - Payable" ? " (payable, not yet settled)" : ""}`,
  });
}

// ---- Portfolio Position Analysis (as of 18/09/2026) -> positionSnapshots[] (24 equities, nonzero qty only)
const posAll = read("G21010015_58171_PortfolioPositionMain4089OT.csv");
const posStart = posAll.findIndex((r) => r[0] === "Security" && r[1] === "Quantity");
const posEnd = posAll.findIndex((r, i) => i > posStart && r[0]?.startsWith("Total : Listed"));
const positionSnapshots = posAll.slice(posStart + 1, posEnd)
  .filter((r) => r[0] && SECURITIES[r[0]])
  .map((r) => ({ account: ACCOUNT, symbol: symbolOf(r[0]), asOf: "2026-09-18", qty: n(r[1]), snapshotSource: SOURCE }));

const payload = {
  source: SOURCE,
  notes: "Kabir Capital PMS backfill, 22/01/2026-18/09/2026, from Nuvama Wealthspectrum portal exports (see MANIFEST.md).",
  securities,
  transactions,
  cashEvents: [...capitalEvents, ...dividendEvents, ...feeEvents],
  positionSnapshots,
};
fs.writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(`securities ${securities.length}, transactions ${transactions.length}, cashEvents ${payload.cashEvents.length} (${capitalEvents.length} capital, ${dividendEvents.length} dividend, ${feeEvents.length} fee), positionSnapshots ${positionSnapshots.length}`);
console.log(`written -> ${out}`);
