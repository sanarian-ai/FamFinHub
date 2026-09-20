// Integrity checks for the M1 seed: counts, buy totals, per-ticker units vs broker snapshots.
import { PrismaClient } from "@prisma/client";
import { splitFactor } from "../../src/lib/portfolio/splits";
const p = new PrismaClient();
const iso = (x: Date) => x.toISOString().slice(0, 10);
async function main() {
  const counts = {
    accounts: await p.portfolioAccount.count(), securities: await p.security.count(), actions: await p.corporateAction.count(),
    tx: await p.portfolioTransaction.count(), snaps: await p.positionSnapshot.count(), prices: await p.priceDaily.count(), fx: await p.fxDaily.count(),
  };
  console.log(counts);
  const tx = await p.portfolioTransaction.findMany({ include: { account: true, security: { include: { actions: true } } } });
  const byAcc: Record<string, number> = {};
  for (const t of tx) if (t.side === "BUY") byAcc[t.account.key] = (byAcc[t.account.key] ?? 0) + Number(t.qty) * Number(t.price);
  console.log("buy $ by account", byAcc, "sells", tx.filter((t) => t.side === "SELL").length);
  const units = new Map<string, number>();
  for (const t of tx) {
    const f = splitFactor(t.security.actions.map((a) => ({ effectiveDate: iso(a.effectiveDate), ratio: Number(a.ratio) })), iso(t.tradeDate));
    const k = `${t.account.key}|${t.security.symbol}`;
    units.set(k, (units.get(k) ?? 0) + (t.side === "BUY" ? 1 : -1) * Number(t.qty) * f);
  }
  const snaps = await p.positionSnapshot.findMany({ include: { account: true, security: true } });
  let bad = 0;
  for (const s of snaps) {
    const k = `${s.account.key}|${s.security.symbol}`; const u = units.get(k) ?? 0; const diff = u - Number(s.qty);
    if (Math.abs(diff) > 0.0005) bad++;
    console.log(k.padEnd(24), u.toFixed(6).padStart(14), Number(s.qty).toFixed(6).padStart(14), diff.toFixed(6).padStart(11));
  }
  const closed = [...units].filter(([k, u]) => !snaps.some((s) => `${s.account.key}|${s.security.symbol}` === k) && Math.abs(u) > 0.0005);
  console.log("mismatches", bad, "unsnapshotted nonzero", closed);
}
main().finally(() => p.$disconnect());
