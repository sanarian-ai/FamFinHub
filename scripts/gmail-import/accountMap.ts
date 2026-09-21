/**
 * Maps the last 3-4 digits printed in an ICICI alert email to one of the app's Account.name
 * values (see prisma/seed-data/build_seed_json.py ACCOUNT_META for the canonical list).
 *
 * Verified from real inbox data (Sep 2026 audit):
 *  - "630" appears only on net-banking alerts addressed solely to sangeeth.aloysius@gmail.com
 *    -> Sangeeth's ICICI savings/debit account (iciciSavings).
 *  - "3008" appears on credit-card alerts addressed solely to sangeeth.aloysius@gmail.com
 *    -> Sangeeth's ICICI credit card (iciciCredit).
 *  - "3107" appears on credit-card alerts CC'd to riaishere@gmail.com, confirmed by Sangeeth
 *    to be Ria's add-on card on the same ICICI credit account -> logged as iciciRiaCredit,
 *    same convention the historical sheet migration already used.
 *  - "3206" — Appa's supplementary card. Confirmed against a real live alert 2026-09-16
 *    ("PAX INNOVATION ICT SER", INR 2.00) — this mapping is now verified, not just inferred.
 *
 * Provisional, not yet confirmed against a live alert:
 *  - "3129" — Ria's ICICI account number ends in this per her own forwarded statement subject
 *    lines (2026-09-21 audit); mapped to iciciRiaSavings on that inference. Ria's Gmail
 *    forwarding for live per-transaction alerts was only just set up (2026-09-21) — verify this
 *    mapping the first time an actual forwarded alert (not a statement) arrives.
 *
 * Explicitly NOT mapped — do not guess:
 *  - "3305" — a live credit-card alert for this card arrived 2026-09-16 alongside the XX3206
 *    confirmation, but whose card this is has not been established. Any daily-import run must
 *    report this as excluded/unmapped rather than silently drop or guess-assign it.
 *
 * Not yet mapped: SBI credit card (Ria's) — no per-transaction alert template has ever been
 * seen for it, only monthly statements; it is handled via monthly reconciliation only, not this
 * last-digit map.
 */
export const ACCOUNT_LAST_DIGIT_MAP: Record<string, string> = {
  "630": "iciciSavings",
  "3008": "iciciCredit",
  "3107": "iciciRiaCredit",
  "3206": "iciciCard3206", // Appa's supplementary card — confirmed against a live alert 2026-09-16
  "3129": "iciciRiaSavings", // provisional — inferred from Ria's forwarded statement subject, not yet confirmed against a live alert
  // "3305" deliberately absent — unidentified card, must not be guess-mapped (see comment above)
};

export function resolveAccountName(lastDigits: string): string | null {
  return ACCOUNT_LAST_DIGIT_MAP[lastDigits] ?? null;
}
