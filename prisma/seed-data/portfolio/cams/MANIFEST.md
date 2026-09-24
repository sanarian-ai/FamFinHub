# CAMS/KFintech Consolidated Account Statement — source manifest

Holder: Ria (all 31 accounts, key prefix `MF_FOLIO_`). Source: a CAMS/KFintech Consolidated
Account Statement (CAS) — a single PAN/email-consolidated PDF covering every mutual fund folio
across every AMC, downloaded periodically by the user (mutual fund CAS statements are typically
requested by email from camsonline.com / kfintech.com, or generated from an AMC/RTA portal) and
uploaded here for parsing. There is no live API for this data — each refresh is a fresh statement
upload, parsed and re-ingested (idempotent: see camsParser.ts's header comment).

## Pipeline

```
npx tsx scripts/portfolio/cams/parse.ts  <path-to-CAS.pdf>            # -> prisma/seed-data/portfolio/cams/<asOfDate>/ingest_payload.json
npx tsx scripts/portfolio/cams/seed.ts   <path-to-ingest_payload.json> # loads it into the DB
npx tsx scripts/portfolio/cams/verify.ts <path-to-ingest_payload.json> # row counts + tie-out vs the statement's own totals
```

`parse.ts` shells out to `pdftotext -layout` (exact text extraction, no OCR) and hands the result
to the pure parser in `src/lib/portfolio/camsParser.ts` — see that file's header comment for the
folio/scheme/account-key model, the multi-scheme-folio handling, and the line-wrap edge cases it
was built against. Deterministic: the same PDF always produces byte-identical output.

## First statement (this seed)

Uploaded by the user 24-Sep-2026, covering 01-Apr-2022 to 24-Sep-2026 (as-of 23-Sep-2026 for
NAV/valuation). Fixture copy kept at `scripts/portfolio/fixtures/cams-cas-sample.pdf` for
re-running the parser against known-good output.

- 12 AMCs, 38 folio blocks, 31 distinct accounts (5 folios legitimately hold 2 schemes each —
  see camsParser.ts), 24 distinct mutual fund securities (symbol = ISIN — see camsParser.ts for
  why that needed no schema change), 95 transactions, 38 position snapshots, 24 current NAVs.
- Reconciled against the statement's own Portfolio Summary table: cost value 23,523,488.48,
  market value 25,801,786.57 (both to the rupee) — verified in `verify.ts` by rebuilding market
  value from ingested snapshots × latest price and matching the printed total exactly.
- 0 open review items after ingest — every row classified cleanly (no unmatched charges, no
  unrecognized transaction descriptions).

## Known limitations

- Switches are modeled as a paired ordinary SELL (switch-out) + BUY (switch-in) at the reported
  amount/units/price, per the confirmed design in `mf-equity-irr-tracking-proposal.md` — tagged
  with a best-effort `switchGroupId` (`SW:<date>:<abs(amount)>`) for display only, never read by
  IRR/lot math.
- Equity holdings are out of scope for this pipeline (see the proposal doc — equity source
  deferred, user's own choice).
- The reconcile() step in `src/lib/portfolio/ingest.ts` was rewritten from one DB round trip per
  position to a batched findMany + createMany during this build — the original was correct but
  became slow enough (~0.7-0.8s per round trip over this network) to time out once the portfolio
  grew to ~70+ positions across accounts. Functionally identical output, just batched.
