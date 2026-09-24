// Pure parser: CAMS/KFintech Consolidated Account Statement (CAS) text -> a structured payload
// shaped exactly like ingestPortfolio()'s input (securities/transactions/prices/positionSnapshots),
// plus warnings for anything it couldn't confidently classify (never silently dropped).
//
// Input is the plain-text output of `pdftotext -layout <cas>.pdf -` — see scripts/portfolio/cams/
// parse.ts for the PDF entry point. Re-running this on the same text always produces byte-identical
// output: no live state, no randomness, no network calls. That's what makes it safe to re-run on
// every periodic CAS upload — see mf-equity-irr-tracking-proposal.md for the switch/ingestion design.
//
// Folio == account (PortfolioAccount), scheme (ISIN) == security. Verified against the sample
// statement (24-Sep-2026 CAS): 38 "Folio No:" blocks, but only 33 distinct (AMC, folio) pairs — five
// folios legitimately hold more than one scheme under the same folio number (multi-scheme folios are
// a normal CAMS/registrar convention, e.g. Kotak folio 17276586 holds both a Mid Cap and an Arbitrage
// scheme). That's fine: PortfolioAccount already relates to many PortfolioTransaction/PositionSnapshot
// rows, each carrying its own securityId, so one account naturally holds several schemes. The account
// key is therefore just AMC+folio — reused across that folio's blocks — and is disambiguated only in
// the much narrower case of the *same* (AMC, folio, ISIN) triple repeating (a genuinely separate ledger
// for the identical scheme under one folio number), using that block's own earliest transaction date
// so the key stays stable across future re-uploads rather than depending on parse order.
//
// A folio number is also only unique within one AMC, never across the whole CAS (two different AMCs
// can print the identical folio number) — hence AMC is always part of the key, not folio alone.
//
// Security identity is the ISIN itself: it's exactly 12 uppercase alphanumeric chars, which happens to
// satisfy Security.symbol's own constraint (1-12 chars, `[A-Z0-9.-]`), so no schema-level ISIN column
// is needed — the ISIN *is* the symbol for every MUTUAL_FUND security.

export type CamsTransaction = {
  account: string; // PortfolioAccount.key, e.g. MF_FOLIO_PPFAS_Mutual_Fund_1048241968
  symbol: string; // ISIN
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  fee: number;
  execTs: string;
  tradeDate: string;
  source: "cams_cas_pdf";
  brokerRef: string;
  switchGroupId: string | null;
  meta: { folio: string; isin: string; date: string; kind: string; description: string; rawAmount: number };
};

export type CamsSecurity = { symbol: string; name: string; kind: "MUTUAL_FUND"; currency: "INR"; exchange: null };
export type CamsAccount = { key: string; broker: "MF_FOLIO"; name: string; holder: string; baseCurrency: "INR" };
export type CamsSnapshot = { account: string; symbol: string; asOf: string; qty: number; snapshotSource: "cams_cas_pdf" };
export type CamsPrice = { symbol: string; date: string; close: number; priceSource: "cams_cas_pdf" };
export type CamsWarning = { folio: string | null; line: string; reason: string };

export type CamsParseResult = {
  accounts: CamsAccount[];
  securities: CamsSecurity[];
  transactions: CamsTransaction[];
  positionSnapshots: CamsSnapshot[];
  prices: CamsPrice[];
  warnings: CamsWarning[];
  summary: { folioCount: number; totalCostValue: number; totalMarketValue: number; asOfDate: string | null };
};

const MONTHS: Record<string, string> = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
/** "17-Sep-2024" -> "2024-09-17" */
function isoDate(dmy: string): string {
  const m = dmy.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) throw new Error(`unparseable date: ${dmy}`);
  const mm = MONTHS[m[2]];
  if (!mm) throw new Error(`unknown month in date: ${dmy}`);
  return `${m[3]}-${mm}-${m[1]}`;
}
/** "(4,257,812.56)" -> -4257812.56 ; "1,999,900.00" -> 1999900.00 */
function n(tok: string): number {
  const neg = tok.trim().startsWith("(");
  const v = Number(tok.replace(/[(),]/g, ""));
  return neg ? -v : v;
}
const NUM_TOKEN = /\(?-?[\d,]+\.\d{1,4}\)?/g;
function sanitizeKey(s: string): string {
  return s.trim().replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

type Kind = "PURCHASE" | "REDEMPTION" | "SWITCH_IN" | "SWITCH_OUT" | "CHARGE" | "INFO" | "UNKNOWN";
function classify(desc: string, numCount: number): Kind {
  const d = desc.toLowerCase();
  if (numCount === 0) return "INFO"; // e.g. ***Registration of Nominee***, ***Address Updated from KRA Data***
  if (/stamp duty|stt paid/.test(d)) return "CHARGE";
  if (/switch/.test(d)) {
    if (/\bin\b/.test(d)) return "SWITCH_IN";
    if (/\bout\b/.test(d)) return "SWITCH_OUT";
    return "UNKNOWN";
  }
  if (/redemption/.test(d)) return "REDEMPTION";
  if (/purchase/.test(d)) return "PURCHASE";
  return "UNKNOWN";
}

type PendingClose = { balStr: string; navDateStr: string; navStr: string; costStr: string; mktStr: string };

export function parseCamsStatement(text: string): CamsParseResult {
  const lines = text.split(/\r?\n/);

  const accountsByKey = new Map<string, CamsAccount>();
  const usedAccountSecurity = new Set<string>(); // `${accountKey}|${isin}` already emitted this run
  const securities = new Map<string, CamsSecurity>(); // isin -> security
  const transactions: CamsTransaction[] = [];
  const positionSnapshots: CamsSnapshot[] = [];
  const prices: CamsPrice[] = [];
  const warnings: CamsWarning[] = [];

  let currentAmc: string | null = null;
  let currentFolio: string | null = null;
  let currentHolder: string | null = null;
  let currentIsin: string | null = null;
  let currentSchemeName: string | null = null;
  let currentDemat: string | null = null;
  let blockAmc: string | null = null; // AMC captured at the ISIN line, immune to the next section's header appearing before this block is flushed
  let pendingHolderLine = false; // the line right after "Folio No:" is the holder's name
  // Raw rows collected for the current folio block, in document order, so a CHARGE row can be
  // folded into the immediately preceding real transaction of the same date, and finalized only
  // once the whole block (including its Closing Unit Balance line) is known.
  let blockRows: { kind: Kind; date: string; desc: string; nums: number[]; raw: string; _fee?: number }[] = [];
  let pendingClose: PendingClose | null = null;
  let asOfDate: string | null = null;
  let totalCostCents = 0;
  let totalMarketCents = 0;

  function flushBlock() {
    const folio = currentFolio, isin = currentIsin;
    const rows = blockRows, close = pendingClose;
    blockRows = [];
    pendingClose = null;
    if (!folio || !isin) return; // Folio No line with no scheme/ISIN ever followed it — nothing to emit
    if (!securities.has(isin)) return; // shouldn't happen; guards a malformed block

    // Fold CHARGE rows (Stamp Duty / STT) into the immediately preceding real row, same date.
    let lastRealIdx = -1;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.kind === "CHARGE") {
        if (lastRealIdx >= 0 && rows[lastRealIdx].date === row.date) rows[lastRealIdx]._fee = (rows[lastRealIdx]._fee ?? 0) + row.nums[0];
        else warnings.push({ folio, line: row.raw, reason: "charge row with no matching same-date transaction to fold into" });
        continue;
      }
      if (row.kind === "INFO") continue;
      if (row.kind === "UNKNOWN") { warnings.push({ folio, line: row.raw, reason: "unrecognized transaction description — not classified as purchase/redemption/switch" }); continue; }
      lastRealIdx = i;
    }

    const realRows = rows.filter((r) => r.kind === "PURCHASE" || r.kind === "REDEMPTION" || r.kind === "SWITCH_IN" || r.kind === "SWITCH_OUT");
    const amc = blockAmc ?? "UNKNOWN";

    // Account key: AMC+folio — one folio legitimately holds several schemes (see file header), so
    // this key is *reused* across this folio's blocks, not made unique per block. It's disambiguated
    // only in the narrower case of the same (AMC, folio, ISIN) triple repeating — a genuinely separate
    // ledger for the identical scheme under one folio number — using that block's own earliest
    // transaction date so the key stays stable across future re-uploads.
    const baseKey = `MF_FOLIO_${sanitizeKey(amc)}_${sanitizeKey(folio)}`;
    let accountKey = baseKey;
    if (usedAccountSecurity.has(`${baseKey}|${isin}`)) {
      const earliest = realRows.map((r) => r.date).sort()[0] ?? close?.navDateStr ?? "unknown";
      accountKey = `${baseKey}_${earliest}`;
      let suffix = 2;
      while (usedAccountSecurity.has(`${accountKey}|${isin}`)) { accountKey = `${baseKey}_${earliest}_${suffix}`; suffix++; }
    }
    usedAccountSecurity.add(`${accountKey}|${isin}`);
    if (!accountsByKey.has(accountKey)) {
      accountsByKey.set(accountKey, {
        key: accountKey, broker: "MF_FOLIO",
        name: `${amc} - Folio ${folio}`,
        holder: currentHolder ?? "Ria", baseCurrency: "INR",
      });
    }

    const seen = new Map<string, number>();
    for (const row of realRows) {
      const side: "BUY" | "SELL" = row.kind === "PURCHASE" || row.kind === "SWITCH_IN" ? "BUY" : "SELL";
      const [amount, unitsRaw, priceRaw] = row.nums;
      const qty = Math.abs(unitsRaw);
      const price = Math.abs(priceRaw);
      const fee = row._fee ?? 0;
      const key = `CAMS:${folio}:${isin}:${row.date}:${row.kind}`;
      const dupIdx = seen.get(key) ?? 0; seen.set(key, dupIdx + 1);
      const brokerRef = dupIdx ? `${key}:${dupIdx}` : key;
      const switchGroupId = row.kind === "SWITCH_IN" || row.kind === "SWITCH_OUT" ? `SW:${row.date}:${Math.abs(amount).toFixed(2)}` : null;
      transactions.push({
        account: accountKey, symbol: isin, side, qty, price, fee,
        execTs: `${row.date}T10:00:00Z`, tradeDate: row.date, source: "cams_cas_pdf", brokerRef, switchGroupId,
        meta: { folio, isin, date: row.date, kind: row.kind, description: row.desc, rawAmount: amount },
      });
    }

    if (close) {
      const navDate = isoDate(close.navDateStr);
      const closingUnits = n(close.balStr);
      const nav = n(close.navStr);
      asOfDate = navDate; // same statement-wide valuation date on every folio
      totalCostCents += Math.round(n(close.costStr) * 100);
      totalMarketCents += Math.round(n(close.mktStr) * 100);
      positionSnapshots.push({ account: accountKey, symbol: isin, asOf: navDate, qty: closingUnits, snapshotSource: "cams_cas_pdf" });
      if (nav > 0) prices.push({ symbol: isin, date: navDate, close: nav, priceSource: "cams_cas_pdf" });
    } else {
      warnings.push({ folio, line: "(end of block)", reason: "no Closing Unit Balance line found for this folio — no position snapshot recorded" });
    }
  }

  let prevLine = "";
  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    const lineBefore = prevLine; // snapshot before any branch below can `continue` past the update
    prevLine = line;

    const amcMatch = line.match(/^([A-Z][A-Za-z .]+Mutual Fund)\s*$/);
    if (amcMatch) { currentAmc = amcMatch[1].trim(); continue; }

    const folioMatch = line.match(/^Folio No:\s*(\S.*?)\s{2,}PAN:/);
    if (folioMatch) {
      flushBlock();
      currentFolio = folioMatch[1].trim();
      currentHolder = null;
      currentIsin = null;
      currentSchemeName = null;
      currentDemat = null;
      blockAmc = null;
      pendingHolderLine = true;
      continue;
    }

    if (pendingHolderLine) {
      const t = line.trim();
      // The line right after "Folio No:" is usually the holder's name, but some pages inject a
      // stray watermark/version line first (e.g. "CAMSCASWS-24092664047 Version:V3.5 Live-1018") —
      // skip anything that doesn't look like a plausible name and keep waiting for one that does.
      if (t && /^[A-Za-z][A-Za-z .]*$/.test(t) && !/^Nominee/.test(t)) {
        const first = t.split(/\s+/)[0];
        currentHolder = first[0].toUpperCase() + first.slice(1).toLowerCase();
        pendingHolderLine = false;
      } else if (t) {
        pendingHolderLine = false; // gave up — no plausible name line found before real content started
      }
    }

    if (line.includes("ISIN:")) {
      const isinMatch = line.match(/ISIN:\s*([A-Z0-9]{12})/);
      if (isinMatch && currentFolio) {
        currentIsin = isinMatch[1];
        blockAmc = currentAmc; // snapshot now — a later AMC header line must never relabel this block
        let preIsin = line.split(/\s*-\s*ISIN:/)[0];
        // A long scheme name/code line wraps onto a second physical line — sometimes cleanly before
        // the "(Demat)/(Non-Demat)" marker, sometimes mid-word or even mid-parenthetical ("...(Non" /
        // "-Demat)..." on the next line). Detected by: this line's pre-ISIN text doesn't start with
        // the AMFI product code pattern (code-hyphen-name) that a non-wrapped line always has. In that
        // case the real text is `lineBefore + preIsin`, joined with no space only where one side already
        // supplies the join character (an opening "(" / hyphen just before, or the other side starting
        // with ")" / "-") — otherwise pdftotext's own line-wrap silently drops a real word-space.
        if (!/^[A-Za-z0-9]+-/.test(preIsin)) {
          const cleanedPrev = lineBefore.replace(/\s+Registrar\s*:.*$/, "").replace(/\s+$/, "");
          const noSpace = /[(-]$/.test(cleanedPrev) || /^[)-]/.test(preIsin);
          preIsin = cleanedPrev + (noSpace ? "" : " ") + preIsin;
        }
        currentDemat = /\(Non-Demat\)/.test(preIsin) ? "Non-Demat" : /\(Demat\)/.test(preIsin) ? "Demat" : null;
        currentSchemeName = preIsin.replace(/^[A-Za-z0-9]+-/, "").replace(/\((Non-)?Demat\)\s*$/, "").trim().replace(/-\s*$/, "").trim();
        if (!securities.has(currentIsin)) securities.set(currentIsin, { symbol: currentIsin, name: currentSchemeName || currentIsin, kind: "MUTUAL_FUND", currency: "INR", exchange: null });
      }
      continue;
    }

    // pdftotext -layout usually pads 2+ spaces after the date, but at least one observed row in
    // the sample statement has only a single space (a column-width quirk on that particular row) —
    // \s+ (not \s{2,}) so a transaction row is never silently skipped over whitespace alone.
    const txMatch = line.match(/^(\d{2}-[A-Za-z]{3}-\d{4})\s+(.*)$/);
    if (txMatch && currentFolio) {
      const date = isoDate(txMatch[1]);
      const rest = txMatch[2];
      const nums = (rest.match(NUM_TOKEN) ?? []).map(n);
      const desc = rest.replace(NUM_TOKEN, "").trim().replace(/\s{2,}/g, " ");
      const kind = classify(desc, nums.length);
      if ((kind === "PURCHASE" || kind === "REDEMPTION" || kind === "SWITCH_IN" || kind === "SWITCH_OUT") && nums.length < 3) {
        warnings.push({ folio: currentFolio, line: rawLine, reason: `expected amount/units/price for a ${kind} row but found ${nums.length} numeric fields` });
        continue;
      }
      if (kind === "CHARGE" && nums.length !== 1) {
        warnings.push({ folio: currentFolio, line: rawLine, reason: `expected exactly one amount for a charge row but found ${nums.length}` });
        continue;
      }
      blockRows.push({ kind, date, desc, nums, raw: rawLine });
      continue;
    }

    const closeMatch = line.match(/^Closing Unit Balance:\s*([\d,.]+)\s+NAV on ([\dA-Za-z-]+):\s*INR\s*([\d,.]+)\s+Total Cost Value:\s*([\d,.]+)\s+Market Value on [\dA-Za-z-]+:\s*INR\s*([\d,.]+)/);
    if (closeMatch && currentFolio && currentIsin) {
      const [, balStr, navDateStr, navStr, costStr, mktStr] = closeMatch;
      pendingClose = { balStr, navDateStr, navStr, costStr, mktStr };
      continue;
    }
  }
  flushBlock();

  const accounts = [...accountsByKey.values()];
  return {
    accounts, securities: [...securities.values()], transactions, positionSnapshots, prices, warnings,
    summary: { folioCount: accounts.length, totalCostValue: totalCostCents / 100, totalMarketValue: totalMarketCents / 100, asOfDate },
  };
}
