import { createHash } from "crypto";

// Mirrors the hashing logic in prisma/seed-data/build_seed_json.py (dedupe_hash()) exactly for
// the base key shape (date + amount + account NAME + normalized description) — keep these two
// implementations in sync if that base key shape ever changes.
//
// sourceRef (optional): a stable per-transaction identifier from the source — a Gmail message id
// for a daily alert email, or a bank-provided line reference / statement line index for a monthly
// reconciliation delta. When present, it's folded into the hash so two genuinely distinct
// transactions that happen to share date+amount+account+description (e.g. two identical-fare
// Uber rides the same day — the real collision hit in section 19) no longer collide, while
// re-processing the same email/line still produces the same hash and is correctly caught as a
// duplicate. When absent (migration, manual entry, csv_import, or any caller with no stable ref),
// the hash is computed exactly as before — this keeps every already-migrated and already-ingested
// row's hash unchanged, so no backfill is needed and nothing already in the database is affected.
export function computeDedupeHash(
  txnDate: Date,
  amount: number,
  accountName: string | null,
  rawDescription: string,
  sourceRef?: string | null,
) {
  const dateOnly = txnDate.toISOString().slice(0, 10); // YYYY-MM-DD, matches build_seed_json.py's date_only
  const normDesc = rawDescription.trim().toLowerCase().replace(/\s+/g, " ");
  const baseKey = `${dateOnly}|${amount.toFixed(2)}|${accountName ?? ""}|${normDesc}`;
  const key = sourceRef ? `${baseKey}|${sourceRef}` : baseKey;
  return createHash("sha256").update(key).digest("hex");
}

// ── Near-duplicate matching (added 2026-10-12) ──────────────────────────────────────────────
// computeDedupeHash() above is an EXACT key: it only catches a row whose date, amount, account and
// description text are byte-identical. It cannot catch the same real transaction arriving twice with
// differently-worded descriptions, which is what actually happened:
//   - gmail_daily vs gmail_monthly_reconcile: the alert says "RAZ*Swiggy", the statement says
//     "RAZSwiggy Bangalore IN" (and their sourceRefs differ by construction, a Gmail message id vs a
//     statement line);
//   - gmail_monthly_reconcile re-read on a later run: the statement PDF wraps lines, so the parser
//     splices reference fragments from the neighbouring line into the description ("mahi/6635…/ici154b…
//     prime cut upi/…" vs "prime cut upi/… bank/6636…/icia…"), and those fragments vary run to run.
// descriptionsLikelyMatch() compares the MERCHANT content of two descriptions instead: it drops
// reference numbers, hash tokens, payment-rail words and city/country noise, and calls two
// descriptions a match when they share a merchant token. It is deliberately conservative — two
// descriptions with no shared merchant token never match, so a different merchant that happens to have
// the same date+amount stays a separate transaction.

const STOP_TOKENS = new Set([
  "upi", "bank", "payment", "payments", "pay", "paid", "india", "indian", "limited", "private", "pvt", "ltd",
  "ach", "neft", "imps", "rtgs", "nach", "ecs", "vps", "bil", "cms", "top", "inf", "card", "debit", "credit",
  "transfer", "from", "with", "for", "the", "and", "via", "ref", "txn", "bangalore", "bengaluru", "mumbai",
  "delhi", "noida", "gurgaon", "gurugram", "chennai", "hyderabad", "pune", "kolkata", "cochin", "kochi",
  "singapore", "london", "san", "francisco", "state", "services", "service", "store", "shop", "online",
  "retail", "grocery", "mart", "iciciupi", "yesbank", "axis", "hdfc", "icici", "kotak", "sbi", "indusind",
  "airtel", "paytm", "ybl", "okaxis", "okhdfcbank", "okicici", "oksbi", "ibl", "axl", "rzp", "razorpay",
  "cashfree", "payu", "billdesk", "na", "xx", "order", "orders", "purchase", "invoice", "bill", "recharge",
  "charges", "fees", "reversal", "global", "solutions", "enterprises", "technologies", "systems",
]);

/** Lowercased, whitespace-collapsed — the same normalisation computeDedupeHash() applies. */
export function normDescription(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Merchant-bearing tokens of a description (≥4 letters/digits, not a reference number, hash or rail word). */
export function merchantTokens(raw: string): string[] {
  const out = new Set<string>();
  for (const w of normDescription(raw).split(/[^a-z0-9]+/)) {
    if (w.length < 4) continue;
    if (STOP_TOKENS.has(w)) continue;
    if (/^\d+$/.test(w)) continue; // reference / UTR / card numbers
    if (/^(ici|pppl|hdfc|axi|yes)[0-9a-f]{8,}$/.test(w)) continue; // bank reference hash fragments
    if (/^[0-9a-f]{10,}$/.test(w)) continue; // bare hex hash fragments
    if (/\d/.test(w) && /[a-z]/.test(w) && w.length >= 10) continue; // long mixed alnum = reference, not a name
    out.add(w);
  }
  return [...out];
}

const compact = (raw: string) => normDescription(raw).replace(/[^a-z0-9]+/g, "");

/**
 * True when two descriptions plausibly describe the same merchant: any merchant token of one appears
 * (as a substring, so "ptm*uber" / "ptmuber" / "uber india systems" all line up) in the other's
 * punctuation-stripped text. Symmetric. Identical normalised descriptions are NOT special-cased here —
 * callers decide what an identical-text pair means (see dedupeReview.ts / the ingest route).
 */
export function descriptionsLikelyMatch(a: string, b: string): boolean {
  const ca = compact(a), cb = compact(b);
  for (const t of merchantTokens(a)) if (cb.includes(t)) return true;
  for (const t of merchantTokens(b)) if (ca.includes(t)) return true;
  return false;
}
