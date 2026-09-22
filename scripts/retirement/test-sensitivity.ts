/**
 * Sensitivity analysis tests (M4). Run: npx tsx scripts/retirement/test-sensitivity.ts
 * Fully deterministic (fixed seed in assumptions.seed, like the rest of the engine), so the
 * exact numbers below are golden values, not tolerances-with-noise.
 */
import assert from "node:assert/strict";
import { computeSensitivities, defaultPlanState, evaluate, SHOCKS } from "../../src/lib/retirement";

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; } catch (e) { fail++; console.error("FAIL", name, "\n  ", (e as Error).message); }
}

t("every shock in SHOCKS has a unique key", () => {
  const keys = SHOCKS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

t("computeSensitivities never mutates the state it's given", () => {
  const s = defaultPlanState();
  const before = JSON.stringify(s);
  computeSensitivities(s);
  assert.equal(JSON.stringify(s), before);
});

t("returns exactly 3 results, sorted by deltaPct ascending (worst first)", () => {
  const top3 = computeSensitivities(defaultPlanState());
  assert.equal(top3.length, 3);
  assert.ok(top3[0].deltaPct <= top3[1].deltaPct);
  assert.ok(top3[1].deltaPct <= top3[2].deltaPct);
});

t("golden: default plan's top-3 shocks are weaker returns, CPI, then education inflation", () => {
  const s = defaultPlanState();
  const base = evaluate(s).successPct;
  assert.equal(base, 38.23);
  const top3 = computeSensitivities(s);
  assert.deepEqual(top3.map((r) => r.key), ["returnDown", "cpiUp", "eduUp"]);
  assert.deepEqual(top3.map((r) => r.deltaPct), [-15.59, -13.11, -9.56]);
  top3.forEach((r) => assert.equal(r.baselineSuccessPct, base));
});

t("deterministic: two calls on the same state give identical results", () => {
  const s = defaultPlanState();
  assert.deepEqual(computeSensitivities(s), computeSensitivities(s));
});

t("every shock moves successPct (none is a silent no-op)", () => {
  const s = defaultPlanState();
  const base = evaluate(s).successPct;
  for (const shock of SHOCKS) {
    const shocked = shock.apply(s);
    const v = evaluate(shocked).successPct;
    assert.notEqual(v, base, shock.key + " had no effect");
  }
});

console.log(`retirement sensitivity: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
