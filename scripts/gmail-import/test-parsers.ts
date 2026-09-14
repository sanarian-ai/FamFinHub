/**
 * Unit tests for parsers.ts, run against real email fixtures captured from the actual inbox
 * (see fixtures/net_banking.json, fixtures/credit_card.json — 58 emails total, Sep 2026 audit).
 * No test framework dependency — plain assertions, run with `npx tsx scripts/gmail-import/test-parsers.ts`.
 * This is the confidence check before anything touches the ingest API.
 */
import netBankingFixtures from "./fixtures/net_banking.json";
import creditCardFixtures from "./fixtures/credit_card.json";
import { parseNetBankingAlert, parseCreditCardAlert } from "./parsers";
import { resolveAccountName } from "./accountMap";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function check(label: string, cond: boolean, detail?: string) {
  if (cond) pass++;
  else {
    fail++;
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
  }
}

// --- Net banking fixtures ---
for (const f of netBankingFixtures as any[]) {
  const r = parseNetBankingAlert(f.sender, f.plaintextBody);
  const label = `net_banking/${f.msgId}`;
  if (!r.ok) {
    check(label, false, `parse failed: ${r.reason}`);
    continue;
  }
  check(`${label} amount`, r.amount === f.expected.amount, `got ${r.amount}, want ${f.expected.amount}`);
  check(`${label} currency`, r.currency === f.expected.currency);
  check(`${label} merchant`, r.merchant === f.expected.merchant, `got "${r.merchant}"`);
  check(`${label} accountLast`, r.cardOrAccountLast === f.expected.accountLast);
  check(`${label} transactionId`, r.transactionId === f.expected.transactionId);
  check(`${label} txnDateTime`, r.txnDateTime.toISOString().slice(0, 16) === f.expected.txnDateTime.slice(0, 16));
  check(`${label} accountResolves`, resolveAccountName(r.cardOrAccountLast) === "iciciSavings");
}

// --- Credit card fixtures ---
for (const f of creditCardFixtures as any[]) {
  const body = f.bodySource === "full" ? f.plaintextBody : f.snippet;
  const r = parseCreditCardAlert(f.sender, body);
  const label = `credit_card/${f.msgId}`;
  if (!r.ok) {
    check(label, false, `parse failed: ${r.reason}`);
    continue;
  }
  check(`${label} amount`, r.amount === f.expected.amount, `got ${r.amount}, want ${f.expected.amount}`);
  check(`${label} currency`, r.currency === f.expected.currency);
  check(`${label} merchant`, r.merchant === f.expected.merchant, `got "${r.merchant}"`);
  check(`${label} cardLast`, r.cardOrAccountLast === f.expected.cardLast);
  check(
    `${label} txnDateTime`,
    r.txnDateTime.toISOString().slice(0, 19) === f.expected.txnDateTime.slice(0, 19),
    `got ${r.txnDateTime.toISOString()}, want ${f.expected.txnDateTime}`,
  );
  const expectedAccount = f.expected.cardLast === "3008" ? "iciciCredit" : "iciciRiaCredit";
  check(`${label} accountResolves`, resolveAccountName(r.cardOrAccountLast) === expectedAccount);
}

console.log(`\n${pass} passed, ${fail} failed (${netBankingFixtures.length} net-banking + ${creditCardFixtures.length} credit-card fixtures)\n`);
if (failures.length) {
  console.log("Failures:");
  for (const f of failures) console.log(" -", f);
  process.exit(1);
} else {
  console.log("All real-inbox fixtures parsed correctly.");
}
