import { createHash } from "crypto";

// Mirrors the hashing logic in prisma/seed-data/build_seed_json.py (dedupe_hash()) exactly —
// same key shape (date|amount|account NAME string, not id|normalized description) so a
// future Gmail-sourced transaction correctly dedupes against a historically-migrated one.
// Keep these two implementations in sync if the key shape ever changes.
export function computeDedupeHash(txnDate: Date, amount: number, accountName: string | null, rawDescription: string) {
  const dateOnly = txnDate.toISOString().slice(0, 10); // YYYY-MM-DD, matches build_seed_json.py's date_only
  const normDesc = rawDescription.trim().toLowerCase().replace(/\s+/g, " ");
  const key = `${dateOnly}|${amount.toFixed(2)}|${accountName ?? ""}|${normDesc}`;
  return createHash("sha256").update(key).digest("hex");
}
