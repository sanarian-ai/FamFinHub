/**
 * Deterministic (regex-based) parsers for the two ICICI transaction-alert email templates
 * confirmed against real inbox data (see fixtures/*.json — 58 real emails, Sep 2026 audit).
 *
 * Deliberately NOT LLM-based: amounts and dates are exactly the kind of thing a model can
 * misread at scale, and these templates are stable/simple enough that a regex is both more
 * reliable and independently unit-testable. Claude's role in the real pipeline is orchestration
 * only — fetch the raw email via Gmail, hand the body to these functions, POST the result to
 * /api/ingest. If ICICI changes a template, a fixture will start failing and it'll be obvious.
 *
 * Two email families covered:
 *  1. Net banking / UPI payments  — sender customercare@icicibank.com
 *  2. Credit card spends          — sender credit_cards@icicibank.com OR credit_cards@icici.bank.in
 *     (ICICI migrated the sending domain ~Aug/Sep 2026; same template either way)
 *
 * NOT covered yet (no real examples seen in a 90-day window to build/test against):
 *  - ICICI debit card POS/ATM alerts (alert@icicibank.com) — template assumed similar to net
 *    banking based on the Phase 3 audit, but unverified. Left unimplemented rather than guessed.
 *  - dcalerts@icicibank.com decline notices — not a real spend, intentionally excluded.
 */

export type ParsedAlert = {
  amount: number; // always positive (native currency, as printed in the email)
  currency: string; // "INR", "USD", etc. — whatever the email prints
  merchant: string; // raw "Info:"/payee field, UNNORMALIZED — see categorization note below
  txnDateTime: Date;
  cardOrAccountLast: string; // last 3-4 digits, used to resolve an Account
  transactionId?: string; // present on net-banking alerts, absent on credit card alerts
  alertType: "net_banking" | "credit_card";
};

export type ParseFailure = { ok: false; reason: string };
export type ParseResult = ({ ok: true } & ParsedAlert) | ParseFailure;

function parseIciciDate(dateStr: string, timeStr: string): Date | null {
  // "Jul 07, 2026" + "06:49" (net banking, hours:minutes) or "10:38:34" (credit card, h:m:s)
  const iso = `${dateStr} ${timeStr}`;
  const d = new Date(iso.replace(",", ""));
  return isNaN(d.getTime()) ? null : d;
}

const NET_BANKING_RE =
  /You have made an online payment of (\w+) ([\d,]+(?:\.\d+)?) towards (.+?) from your Account XX(\d+) on (\w+ \d{1,2}, \d{4}) at ([\d:]+) hours\.(?:\s*The Transaction ID is (\d+)\.)?/;

export function parseNetBankingAlert(sender: string, body: string): ParseResult {
  if (sender !== "customercare@icicibank.com") {
    return { ok: false, reason: `unexpected sender for net-banking parser: ${sender}` };
  }
  const m = NET_BANKING_RE.exec(body.replace(/\s+/g, " "));
  if (!m) return { ok: false, reason: "body did not match net-banking template" };
  const [, currency, amountStr, merchant, acctLast, dateStr, timeStr, txnId] = m;
  const txnDateTime = parseIciciDate(dateStr, timeStr);
  if (!txnDateTime) return { ok: false, reason: `could not parse date/time: ${dateStr} ${timeStr}` };
  return {
    ok: true,
    amount: parseFloat(amountStr.replace(/,/g, "")),
    currency,
    merchant: merchant.trim(),
    txnDateTime,
    cardOrAccountLast: acctLast,
    transactionId: txnId,
    alertType: "net_banking",
  };
}

const CREDIT_CARD_RE =
  /Credit Card XX(\d+) has been used for a transaction of (\w+) ([\d,]+(?:\.\d+)?) on (\w+ \d{1,2}, \d{4}) at ([\d:]+)\. Info: (.+?)\. The Avail/;

export function parseCreditCardAlert(sender: string, body: string): ParseResult {
  if (sender !== "credit_cards@icicibank.com" && sender !== "credit_cards@icici.bank.in") {
    return { ok: false, reason: `unexpected sender for credit-card parser: ${sender}` };
  }
  const m = CREDIT_CARD_RE.exec(body.replace(/\s+/g, " "));
  if (!m) return { ok: false, reason: "body did not match credit-card template" };
  const [, cardLast, currency, amountStr, dateStr, timeStr, merchant] = m;
  const txnDateTime = parseIciciDate(dateStr, timeStr);
  if (!txnDateTime) return { ok: false, reason: `could not parse date/time: ${dateStr} ${timeStr}` };
  return {
    ok: true,
    amount: parseFloat(amountStr.replace(/,/g, "")),
    currency,
    merchant: merchant.trim(),
    txnDateTime,
    cardOrAccountLast: cardLast,
    alertType: "credit_card",
  };
}

/**
 * Routes a raw email (sender + subject + body) to the right parser based on sender/subject,
 * so the orchestrator doesn't need to know the per-template details.
 */
export function parseAlertEmail(sender: string, subject: string, body: string): ParseResult {
  if (sender === "customercare@icicibank.com" && subject.includes("Net Banking")) {
    return parseNetBankingAlert(sender, body);
  }
  if (
    (sender === "credit_cards@icicibank.com" || sender === "credit_cards@icici.bank.in") &&
    subject.includes("Credit Card")
  ) {
    return parseCreditCardAlert(sender, body);
  }
  return { ok: false, reason: `no parser for sender="${sender}" subject="${subject}"` };
}
