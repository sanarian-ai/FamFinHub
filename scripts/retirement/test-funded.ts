/**
 * Funded-status tests (M6). Run: npx tsx scripts/retirement/test-funded.ts
 * Deterministic (no Monte Carlo involved), so exact numbers below are golden values.
 */
import assert from "node:assert/strict";
import { compute, computeFundedStatus, defaultPlanState, presentValueOfExpenses } from "../../src/lib/retirement";

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; } catch (e) { fail++; console.error("FAIL", name, "\n  ", (e as Error).message); }
}

const s = defaultPlanState();
const result = compute(s.params, s.events, s.baseline, s.assumptions);

t("PV of expenses is positive and finite", () => {
  const pv = presentValueOfExpenses(result.rows, s.params.r);
  assert.ok(Number.isFinite(pv) && pv > 0);
});

t("PV of expenses never mutates the rows it's given", () => {
  const before = JSON.stringify(result.rows);
  presentValueOfExpenses(result.rows, s.params.r);
  assert.equal(JSON.stringify(result.rows), before);
});

t("higher discount rate gives a lower PV (later money is worth less, sooner)", () => {
  const lo = presentValueOfExpenses(result.rows, 4);
  const hi = presentValueOfExpenses(result.rows, 12);
  assert.ok(hi < lo);
});

t("PV at 0% discount equals the plain undiscounted sum of Row.exp", () => {
  const pv0 = presentValueOfExpenses(result.rows, 0);
  const sum = result.rows.reduce((a, r) => a + r.exp, 0);
  assert.ok(Math.abs(pv0 - sum) < 1e-6);
});

t("computeFundedStatus: deltaL and fundedRatioPct are internally consistent with pvExpensesL", () => {
  const fs = computeFundedStatus(result.rows, s.params.r, 1000);
  assert.equal(fs.assetsHeldL, 1000);
  assert.ok(Math.abs(fs.deltaL - (1000 - fs.pvExpensesL)) < 1e-9);
  assert.ok(Math.abs(fs.fundedRatioPct - (1000 / fs.pvExpensesL) * 100) < 1e-6);
});

t("golden: default plan's PV of expenses at its own params.r", () => {
  const pv = presentValueOfExpenses(result.rows, s.params.r);
  console.log(`  (golden pv = ${pv.toFixed(4)} L at r=${s.params.r}%)`);
  assert.equal(Math.round(pv * 100) / 100, 2503.18);
});

console.log(`retirement funded status: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
