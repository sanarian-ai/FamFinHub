# Kabir Capital PMS — source manifest

Account: 21010015 RIA EMMANUEL - KCE015, Kabir Capital Advisors LLP - Two Rules Value Fund,
Discretionary PMS, held in Ria's demat via Nuvama. Portal:
https://eclientreporting.nuvamaassetservices.com/wealthspectrum (Wealthspectrum client portal).
Inception 22/01/2026. Holder: Ria (portfolio account key `KABIR_PMS_RIA`).

Downloaded 21 Sep 2026, via the user's already-logged-in Chrome session, one report at a time
with the user's explicit go-ahead per file. Every file below is byte-identical to the portal
export (verified by md5sum at download time and again before parsing) — nothing in `raw/` is
hand-edited. Date range for all reports: 22/01/2026 to 18/09/2026 (as-of 18/09/2026 for the two
point-in-time reports).

| File | Report | Rows (data) |
|---|---|---|
| `G21010015_58171_TransactionStatement_India94OT.csv` | Transaction Statement | 208 (194 equity, 5 equity-MF, 9 liquid-MF) |
| `G21010015_58171_CapitalRegister1173OT.csv` | Capital Register | 2 deposits, 2 TDS-on-payout debits |
| `G21010015_58171_DividendStatement_India177OT.csv` | Statement of Dividend | 12 dividends |
| `G21010015_58171_Expensestmt546OT.csv` | Statement of Expense | STT per trade + custody/fund-accountant fees |
| `G21010015_58171_CapitalGain90OT.csv` | Statement of Capital Gain/Loss | 10 realised lots (all in liquid/arbitrage MFs) |
| `G21010015_58171_PortfolioPositionMain4089OT.csv` | Portfolio Position Analysis (as of 18/09/2026) | 24 equity + cash — reconciliation ground truth |
| `G21010015_58171_ReportPerformancebySecurityInception6077OT.csv` | Performance by Security Since Inception | per-security IRR/benchmark IRR — not yet ingested (P3) |
| `G21010015_58171_CorporateBenefitsReport1767OT.csv` | Corporate benefit | 12 dividend entries, ties to the Dividend Statement; no splits/bonus/rights in this window |

Not downloaded: Statement of Interest (portal returned no file — no interest income in this
account) and Portfolio Performance with Benchmarks (the portal's report engine failed on both a
CSV and an XLS attempt; retried once, not looped further per the user's instructions).

## Symbols

Indian-equity ISIN/NSE-ticker lookup was not available in this session, so every `symbol` below
is an internal placeholder derived from the security's legal name (see `parse.ts` SYMBOL_MAP),
not a confirmed exchange ticker. This is fine for P2 (ingest + reconciliation, which key off the
internal symbol) but must be corrected to real NSE symbols before the daily price-feed task (P5)
is wired up, since that task needs a real ticker to fetch quotes.
