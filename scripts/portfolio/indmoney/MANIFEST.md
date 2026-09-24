# INDmoney MCP as a holdings/units source

Decision (2026-09-24): use the INDmoney MCP connector as the live units source for **Kabir PMS**
and the new **IIFL** account (broker-tagged "Nuvama Wealth And Investment" and "India Infoline"
respectively, under family member "RIA EMMANUEL"). **Mutual funds continue on the CAMS CAS PDF
pipeline** — INDmoney's MF linking for Ria covers only 8 of 24 CAMS-parsed schemes and understates
value by ~₹18L, so it's not used for MF holdings.

## Why
- INDmoney aggregates via the depository (CDSL/NSDL), not the broker directly — it's the same
  authoritative record any broker's holdings ultimately derive from.
- Cross-checked against the Kabir PMS Chrome-scrape (Nuvama Wealthspectrum, last run 2026-09-18):
  23/24 holdings matched exactly. The 1 mismatch (NCL Industries) was checked directly in the
  Kabir/Nuvama portal by the user on 2026-09-24: **483 units is correct** — the original Chrome
  scrape was right, and **INDmoney's figure (276) was wrong** for this one holding. (Initial
  hypothesis — that the scrape was just stale — was itself wrong; corrected here.)
- Net: 23/24 exact, 1/24 a genuine INDmoney data error, not a staleness artifact. Treat INDmoney
  as a fast, mostly-reliable cross-check for this account, not an unconditionally authoritative
  one — a mismatch is worth verifying against the portal directly rather than trusting either
  automated source by default.
- Still genuinely more automated than the Chrome scrape day-to-day (no browser automation to run),
  at the cost of no real cost-basis data (see caveat below).

## What it does NOT give us
`invested_amount` and `current_value` are identical on every INDmoney holdings row — it is not
tracking real acquisition cost. This is a **units/qty-only** source. Cost basis for IIFL comes
from the user separately; Kabir PMS's existing transaction-level cost basis (from the Nuvama
report ingestion) is untouched by this — this only refreshes the position-snapshot qty.

## Mechanics
The MCP is only reachable from a live Claude session — the app's own server (where the daily
Yahoo Finance price refresh runs) cannot call it. So this is not a scheduled/self-serve pipeline
like price refresh; it's run by asking Claude to pull the latest INDmoney holdings and re-run
`seed-holdings.ts` with a fresh payload file. Live prices for both accounts still come from the
existing `/api/portfolio/prices/refresh?scope=kabir` route (Yahoo Finance, NSE) — that route
already covers any INR/NSE STOCK security regardless of account, so IIFL's prices will refresh
automatically once its securities exist, no route changes needed.

## Status
- **Kabir PMS**: refreshed 2026-09-24 via `2026-09-24-kabir-holdings.json` — 24/24 positions
  written, source `indmoney_mcp`, except NCL Industries which was corrected to 483 units
  (`source: manual_verified_portal`) after direct portal verification. Review item resolved.
- **IIFL**: holdings + 24 verified NSE tickers resolved (see chat). No longer blocked — the
  concurrent conversation's uncommitted schema/page changes were discarded on 2026-09-24 at the
  user's direction; this thread now owns all further changes to this repo.
