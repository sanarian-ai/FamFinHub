/**
 * Orchestrator for the Gmail-import pipeline — the piece a real scheduled Claude task will
 * eventually drive. For THIS local test, the "fetch from Gmail" step is replaced by loading
 * the same real fixtures used in test-parsers.ts (they ARE real inbox emails, just captured
 * to disk instead of fetched live) — the parsing/categorization/ingest path below is identical
 * to what production will run.
 *
 * Usage:
 *   npx tsx scripts/gmail-import/run.ts                 # dry run, no writes, prints a preview
 *   npx tsx scripts/gmail-import/run.ts --commit         # actually POSTs to /api/ingest
 *
 * Env:
 *   INGEST_URL       default http://localhost:3000/api/ingest
 *   INGEST_API_KEY   must match the running server's .env value
 */
import netBankingFixtures from "./fixtures/net_banking.json";
import creditCardFixtures from "./fixtures/credit_card.json";
import { parseNetBankingAlert, parseCreditCardAlert, type ParsedAlert } from "./parsers";
import { resolveAccountName } from "./accountMap";

const COMMIT = process.argv.includes("--commit");
const INGEST_URL = process.env.INGEST_URL ?? "http://localhost:3000/api/ingest";
const API_KEY = process.env.INGEST_API_KEY;

type Row = {
  msgId: string;
  source: "net_banking" | "credit_card";
  parsed?: ParsedAlert;
  parseError?: string;
  accountName?: string | null;
  skippedReason?: string;
};

const rows: Row[] = [];

for (const f of netBankingFixtures as any[]) {
  const r = parseNetBankingAlert(f.sender, f.plaintextBody);
  if (!r.ok) {
    rows.push({ msgId: f.msgId, source: "net_banking", parseError: r.reason });
    continue;
  }
  rows.push({ msgId: f.msgId, source: "net_banking", parsed: r, accountName: resolveAccountName(r.cardOrAccountLast) });
}

for (const f of creditCardFixtures as any[]) {
  const body = f.bodySource === "full" ? f.plaintextBody : f.snippet;
  const r = parseCreditCardAlert(f.sender, body);
  if (!r.ok) {
    rows.push({ msgId: f.msgId, source: "credit_card", parseError: r.reason });
    continue;
  }
  rows.push({ msgId: f.msgId, source: "credit_card", parsed: r, accountName: resolveAccountName(r.cardOrAccountLast) });
}

// --- Build the ingest payload, applying safety exclusions ---
const toIngest: { row: Row; txn: any }[] = [];
const excluded: Row[] = [];

for (const row of rows) {
  if (row.parseError) {
    excluded.push(row);
    continue;
  }
  const p = row.parsed!;
  if (!row.accountName) {
    row.skippedReason = `no account mapping for last-digits "${p.cardOrAccountLast}"`;
    excluded.push(row);
    continue;
  }
  // Foreign-currency transactions are still sent, in their native currency — /api/ingest
  // forces these to needs_review (categoryId left null) rather than guessing an INR amount,
  // since the email never states one. They're stored, not lost, and flagged for you to enter
  // the real INR amount once the statement confirms the FX rate.
  toIngest.push({
    row,
    txn: {
      txnDate: p.txnDateTime.toISOString().slice(0, 10),
      rawDescription: p.merchant,
      amount: -p.amount, // negative = expense, per the ingest API contract
      currency: p.currency,
      accountName: row.accountName,
      source: "gmail_daily",
    },
  });
}

console.log(`Parsed ${rows.length} fixture emails: ${toIngest.length} ready to ingest, ${excluded.length} excluded.\n`);

if (excluded.length) {
  console.log("Excluded:");
  for (const r of excluded) {
    console.log(`  ${r.msgId} (${r.source}): ${r.parseError ?? r.skippedReason}`);
  }
  console.log();
}

console.log("Preview of transactions to ingest:");
console.log(
  toIngest
    .map(({ txn }) => {
      const amtLabel = `${txn.currency !== "INR" ? txn.currency + " " : ""}${(-txn.amount).toFixed(2)}`;
      return `  ${txn.txnDate}  ${amtLabel.padStart(14)}  ${txn.accountName.padEnd(16)}  ${txn.rawDescription}`;
    })
    .join("\n"),
);

async function commit() {
  if (!API_KEY) {
    console.error("\nINGEST_API_KEY env var not set — cannot commit.");
    process.exit(1);
  }
  const resp = await fetch(INGEST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({ transactions: toIngest.map((t) => t.txn) }),
  });
  const result = await resp.json();
  console.log(`\nIngest response (${resp.status}):`, JSON.stringify(result, null, 2));
}

if (!COMMIT) {
  console.log(`\nDry run only — pass --commit to POST these ${toIngest.length} transactions to ${INGEST_URL}`);
} else {
  commit();
}
