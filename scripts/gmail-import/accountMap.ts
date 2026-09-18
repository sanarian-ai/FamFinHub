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
 *  - "3206" — Appa's supplementary card, found only via the Mar-Jun statement PDF audit (Sep 2026);
 *    no alert email for it has been seen in this inbox yet, so this mapping is untested against
 *    a live alert and should be verified the first time one arrives.
 *
 * Not yet mapped: Ria's ICICI debit account and SBI credit card — those alerts don't reach
 * this inbox (per the Phase 3/5 audit) until Ria's Gmail forwarding is set up.
 */
export const ACCOUNT_LAST_DIGIT_MAP: Record<string, string> = {
  "630": "iciciSavings",
  "3008": "iciciCredit",
  "3107": "iciciRiaCredit",
  "3206": "iciciCard3206", // Appa's supplementary card — surfaced once in the May19-Jun18 statement audit, no alert emails seen yet
};

export function resolveAccountName(lastDigits: string): string | null {
  return ACCOUNT_LAST_DIGIT_MAP[lastDigits] ?? null;
}
