// One-off ingestion for the four closed pre-PMS/PMS vehicles (Kabir Capital Ventures, Kabir
// Financial Ventures, Unifi Blended-Rangoli, Unifi BCAD 2 Breakout 20) — see
// closed-vehicle-historic-irr-ingestion-spec.md (project doc) for the full design rationale.
//
// Design: one synthetic Security per vehicle (kind STOCK, currency INR, symbol = account key),
// each contribution a BUY of qty 1 at the contribution amount, each withdrawal a SELL of qty 1 at
// the withdrawal amount. No CashEvent rows, no PriceDaily rows — these accounts are fully closed,
// there's no "current value" to price between dated flows, only the flows XIRR needs.
//
// STP (81469STP) is deliberately NOT ingested as a fifth account: it was a feeder, fully
// redistributed into BLN/BCAD20 by Jan 2024, and every one of those transfers is already listed
// below as a BLN/BCAD20 contribution. A separate STP account would double-count ~₹80L.
//
// Idempotent: re-running produces 0 new rows, via PortfolioTransaction's
// @@unique([source, brokerRef]) constraint (brokerRef synthesized as `<key>-<date>-<seq>`).
import { PrismaClient } from "@prisma/client";
import { ingestPortfolio } from "../../../src/lib/portfolio/ingest";
import { buildContext, run, inceptionStart } from "../../../src/lib/portfolio/engine";
import { loadIndiaDataset } from "../../../src/lib/portfolio/india-load";

const prisma = new PrismaClient();

type Row = { date: string; side: "BUY" | "SELL"; amount: number; note: string };

const ACCOUNTS = [
  {
    key: "KABIR_CAPITAL_VENTURES_RIA",
    symbol: "KCV-RIA", // Security.symbol must be <=12 chars, [A-Z0-9.-] only — the account key itself doesn't fit
    broker: "KABIR_CAPITAL_VENTURES" as const,
    name: "Kabir Capital Ventures (closed 2024)",
    rows: [
      { date: "2022-02-14", side: "BUY", amount: 2500000, note: "Initial contribution" },
      { date: "2024-07-19", side: "SELL", amount: 25000, note: "Partial withdrawal" },
      { date: "2024-07-22", side: "SELL", amount: 2475000, note: "Partial withdrawal" },
      { date: "2024-11-30", side: "SELL", amount: 1619095, note: "Final closure" },
    ] as Row[],
  },
  {
    key: "KABIR_FINANCIAL_VENTURES_RIA",
    symbol: "KFV-RIA",
    broker: "KABIR_FINANCIAL_VENTURES" as const,
    name: "Kabir Financial Ventures (closed 2024)",
    rows: [
      { date: "2023-04-15", side: "BUY", amount: 1, note: "Test transfer" },
      { date: "2023-04-15", side: "BUY", amount: 999999, note: "Initial contribution" },
      { date: "2023-04-16", side: "BUY", amount: 1200000, note: "Contribution" },
      { date: "2023-04-17", side: "BUY", amount: 800000, note: "Contribution" },
      { date: "2024-07-19", side: "SELL", amount: 25000, note: "Partial withdrawal" },
      { date: "2024-07-22", side: "SELL", amount: 2100000, note: "Partial withdrawal" },
      { date: "2024-11-30", side: "SELL", amount: 2543671, note: "Final closure" },
    ] as Row[],
  },
  {
    key: "UNIFI_BLN_RIA",
    symbol: "UNIFI-BLN",
    broker: "UNIFI_PMS" as const,
    name: "Unifi — Blended-Rangoli (closed 2025)",
    rows: [
      { date: "2023-09-21", side: "BUY", amount: 1000000, note: "Genuine initial deposit" },
      { date: "2023-10-05", side: "BUY", amount: 1000000, note: "STP-fed tranche" },
      { date: "2023-10-23", side: "BUY", amount: 518462.39, note: "STP-fed tranche" },
      { date: "2023-11-06", side: "BUY", amount: 1000000, note: "STP-fed tranche" },
      { date: "2023-12-05", side: "BUY", amount: 1000000, note: "STP-fed tranche" },
      { date: "2024-01-05", side: "BUY", amount: 500000, note: "STP-fed tranche" },
      { date: "2024-03-31", side: "BUY", amount: 505.48, note: "TDS reversal" },
      { date: "2024-06-30", side: "BUY", amount: 1241.17, note: "TDS reversal" },
      { date: "2024-09-10", side: "BUY", amount: 62.51, note: "Inter-account residual from closed STP" },
      { date: "2024-09-30", side: "BUY", amount: 3169.77, note: "TDS reversal" },
      { date: "2024-12-31", side: "BUY", amount: 250.06, note: "TDS reversal" },
      { date: "2025-03-31", side: "SELL", amount: 0.74, note: "Negative TDS reversal / cash adjustment" },
      { date: "2025-03-31", side: "BUY", amount: 1051.91, note: "TDS reversal" },
      { date: "2025-06-30", side: "BUY", amount: 609.71, note: "TDS reversal" },
      { date: "2025-09-19", side: "SELL", amount: 6244487.23, note: "Full payout" },
      { date: "2025-09-30", side: "BUY", amount: 4589.07, note: "TDS reversal" },
      { date: "2025-11-04", side: "SELL", amount: 3077.0, note: "Final residual payout" },
    ] as Row[],
  },
  {
    key: "UNIFI_BCAD20_RIA",
    symbol: "UNIFI-BCAD20",
    broker: "UNIFI_PMS" as const,
    name: "Unifi — BCAD 2 Breakout 20 (closed 2025)",
    rows: [
      { date: "2023-10-06", side: "BUY", amount: 1000001, note: "Genuine initial deposit" },
      { date: "2023-11-22", side: "BUY", amount: 499340.96, note: "STP-fed tranche" },
      { date: "2023-12-20", side: "BUY", amount: 500000, note: "STP-fed tranche" },
      { date: "2024-01-12", side: "BUY", amount: 1540224.49, note: "In-kind stock switch from STP (Nippon ETF Liquid Bees, valued at transfer)" },
      { date: "2024-01-12", side: "BUY", amount: 513014.48, note: "STP-fed tranche" },
      { date: "2024-01-20", side: "BUY", amount: 1000000, note: "STP-fed tranche" },
      { date: "2024-03-31", side: "SELL", amount: 3280.15, note: "TDS reversal" },
      { date: "2024-06-30", side: "SELL", amount: 1116.89, note: "TDS reversal" },
      { date: "2024-09-30", side: "SELL", amount: 3595.36, note: "TDS reversal" },
      { date: "2024-12-31", side: "SELL", amount: 183.94, note: "TDS reversal" },
      { date: "2025-03-31", side: "SELL", amount: 964.96, note: "TDS reversal" },
      { date: "2025-06-30", side: "SELL", amount: 848.29, note: "TDS reversal" },
      { date: "2025-09-19", side: "SELL", amount: 5675306.67, note: "Full payout" },
      { date: "2025-09-30", side: "SELL", amount: 4363.38, note: "TDS reversal" },
      { date: "2025-11-04", side: "SELL", amount: 2839.0, note: "Final residual payout" },
    ] as Row[],
  },
];

const EXPECTED_XIRR: Record<string, number> = {
  KABIR_CAPITAL_VENTURES_RIA: 0.214,
  KABIR_FINANCIAL_VENTURES_RIA: 0.354,
  UNIFI_BLN_RIA: 0.1243,
  UNIFI_BCAD20_RIA: 0.0703,
};

async function main() {
  console.log(`Total rows across 4 accounts: ${ACCOUNTS.reduce((s, a) => s + a.rows.length, 0)} (expected 43)`);

  // 1. Accounts — upsert by key, isActive: false (fully closed vehicles)
  for (const a of ACCOUNTS) {
    await prisma.portfolioAccount.upsert({
      where: { key: a.key },
      update: {},
      create: { key: a.key, broker: a.broker, name: a.name, holder: "Ria", baseCurrency: "INR", isActive: false },
    });
  }
  console.log("Accounts upserted.");

  // 2. Securities — one synthetic security per account, symbol = account key
  const securities = ACCOUNTS.map((a) => ({ symbol: a.symbol, name: a.name, kind: "STOCK", currency: "INR" }));

  // 3. Transactions — BUY (deposit) / SELL (withdrawal), qty 1, execTs at noon UTC (07:30pm IST /
  // 07:00am ET — safely inside the same calendar day under either timezone, belt-and-braces on top
  // of the SESSION_TZ fix) so sessionDate() always lands on the intended tradeDate.
  const transactions = ACCOUNTS.flatMap((a) => {
    const seq = new Map<string, number>();
    return a.rows.map((r) => {
      const n = (seq.get(r.date) ?? 0) + 1;
      seq.set(r.date, n);
      const brokerRef = `${a.key}-${r.date}-${String(n).padStart(2, "0")}`;
      return {
        account: a.key,
        symbol: a.symbol,
        side: r.side,
        qty: 1,
        price: r.amount,
        fee: 0,
        execTs: `${r.date}T12:00:00.000Z`,
        tradeDate: r.date,
        source: "manual_closed_vehicle_audit",
        brokerRef,
      };
    });
  });

  const result = await ingestPortfolio(prisma, { source: "manual_closed_vehicle_audit", securities, transactions });
  console.log("securities:", result.results.securities);
  console.log("transactions:", result.results.transactions);
  if (result.results.transactions.rejected.length) {
    console.error("REJECTED ROWS:", JSON.stringify(result.results.transactions.rejected, null, 2));
    process.exitCode = 1;
    return;
  }

  // 4. Verification: row counts, per-account XIRR, sums, STP absence, idempotency is left to a
  // second run of this script.
  const ds = await loadIndiaDataset(prisma);
  const ctx = buildContext(ds);

  console.log("\n=== Per-account verification ===");
  for (const a of ACCOUNTS) {
    const trades = ctx.trades.filter((t: (typeof ctx.trades)[number]) => t.account === a.key);
    const buys = trades.filter((t: (typeof trades)[number]) => t.side === "BUY").reduce((s: number, t: (typeof trades)[number]) => s + -t.cash, 0);
    const sells = trades.filter((t: (typeof trades)[number]) => t.side === "SELL").reduce((s: number, t: (typeof trades)[number]) => s + t.cash, 0);
    const start = inceptionStart(ctx, [a.key]); // day BEFORE first trade — run()'s d0 excludes the
    // trade's own date from cashflow events (folds same-day trades into V0 instead), so using the
    // trade date itself as `start` silently swallows the first contribution. Same helper every
    // other India/US screen uses for "SI" (since inception).
    const end = ctx.asof;
    const r = run(ctx, start, end, { accounts: [a.key] });
    const expected = EXPECTED_XIRR[a.key];
    const irr = r.pf.irr;
    const dev = irr != null ? Math.abs(irr - expected) : null;
    console.log(
      `${a.key}: ${trades.length} trades, BUY sum=₹${buys.toFixed(2)}, SELL sum=₹${sells.toFixed(2)}, ` +
        `XIRR=${irr != null ? (irr * 100).toFixed(2) + "%" : "null"} (expected ${(expected * 100).toFixed(2)}%, dev ${dev != null ? (dev * 100).toFixed(3) + "pp" : "n/a"})`
    );
  }

  const stp = await prisma.portfolioAccount.findFirst({ where: { key: { contains: "STP" } } });
  console.log(`\nSTP account present: ${stp ? "YES — PROBLEM: " + stp.key : "no (correct)"}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
