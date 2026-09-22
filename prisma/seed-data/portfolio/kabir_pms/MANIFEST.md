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

All 24 equities now carry confirmed, currently-listed NSE ticker symbols (resolved 22 Sep 2026 via
web research against nseindia.com and cross-checked secondary sources; True Colors Limited and
PNGS Reva Diamond Jewellery Limited confirmed directly by the user: NSE:TRUECOLORS / BSE:544531 and
NSE:PNGSREVA / BSE:544718 respectively). Two of the original internal placeholders did not match the
real ticker and were renamed in place (Security.symbol updated by id, transactions/cashEvents/
snapshots re-point automatically via the unchanged securityId — no re-ingest needed):

| Legal name | Placeholder (P2 backfill) | Confirmed NSE ticker |
|---|---|---|
| P.E. Analytics Limited | PEANALYTICS | PROPEQUITY |
| Technocraft Industries India Ltd | TECHNOCRAFT | TIIL |

All other 22 placeholders already matched the real NSE ticker exactly, so no rename was needed for
them. Two rename-history notes worth knowing if cross-checking old broker paperwork: Alldigi Tech
Limited was formerly Allsec Technologies (ticker ALLSEC → ALLDIGI), and RPSG Ventures Ltd was
formerly CESC Ventures Limited. One same-initials trap: KCP Ltd (ticker KCP) is unrelated to KCP
Sugar and Industries Corporation Ltd (ticker KCPSUGIND) — this holding is the former.

Symbols are now real tickers, ready for the daily price-feed task (P5).
