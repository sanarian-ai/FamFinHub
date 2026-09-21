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
