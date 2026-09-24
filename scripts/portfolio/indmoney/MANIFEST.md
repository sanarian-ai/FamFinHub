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
  23/24 holdings matched exactly; the 1 mismatch (NCL Industries) is because the scrape was 6 days
  stale, not an INDmoney error — see the open PortfolioReviewItem opened by the 2026-09-24 pull.
- It's genuinely more automated than the Chrome scrape for this piece (no browser automation to
  run), at the cost of no real cost-basis data (see caveat below).

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
  written, source `indmoney_mcp`. NCL Industries flagged (see above).
- **IIFL**: holdings + 24 verified NSE tickers resolved (see chat), blocked on adding an
  `IIFL_DEMAT` broker to `prisma/schema.prisma`, which currently has uncommitted changes from a
  concurrent, unrelated conversation. Seed once that clears.
