/**
 * Retirement engine acceptance tests (M1). Run: npx tsx scripts/retirement/test-engine.ts
 *  1. Golden: 17 configurations vs the Runway Ledger v10 reference (every row field to 1e-9, MC to 0.01 pp, seed 7, 10,000 paths).
 *  2. Cross-check: Python v2 (independent numpy implementation), deterministic to 1e-6, MC within sampling error.
 *  3. Invariants (regressions from the Runway build).
 * Fixtures come from scripts/retirement/generators/ (cloud-side, need Chromium and the artifact HTML; committed as JSON).
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_PARAMS, band, cloneParams, compute, simulate, view } from "../../src/lib/retirement";
import type { Params } from "../../src/lib/retirement";

const dir = path.join(process.cwd(), "scripts", "retirement", "fixtures");
const G = JSON.parse(fs.readFileSync(path.join(dir, "golden-v10.json"), "utf8"));
const PY = JSON.parse(fs.readFileSync(path.join(dir, "python-v2.json"), "utf8"));
const close = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

let pass = 0, fail = 0;
function t(name: string, fn: () => void) {
  try { fn(); pass++; } catch (e) { fail++; console.error("FAIL", name, "\n  ", (e as Error).message); }
}

t("DEFAULT_PARAMS equals the reference DEFAULTS", () => assert.deepEqual(DEFAULT_PARAMS, G.defaults));

for (const name of Object.keys(G.res)) {
  const g = G.res[name];
  const P: Params = { ...cloneParams(), ...g.over };
  const r = compute(P, g.custom);
  t(`golden ${name}: rows`, () => {
    assert.equal(r.rows.length, g.rows.length);
    r.rows.forEach((row, i) => {
      const ref = g.rows[i];
      assert.deepEqual(Object.keys(row).sort(), Object.keys(ref).sort());
      for (const k of Object.keys(ref)) assert.ok(close(row[k], ref[k]), `${row.Y} ${k}: ${row[k]} vs ${ref[k]}`);
    });
  });
  t(`golden ${name}: depletion year`, () => assert.equal(r.depl, g.depl));
  t(`golden ${name}: Monte Carlo`, () => {
    const m = simulate(r.rows, P, 10000);
    assert.ok(Math.abs(m.p - g.mc.p) < 0.01, `${m.p} vs ${g.mc.p}`);
    assert.equal(m.med, g.mc.med); assert.equal(m.p10, g.mc.p10);
  });
  t(`golden ${name}: real view`, () => {
    const v = view(r.rows, "real").filter((x) => [2026, 2030, 2039, 2050, 2082].includes(x.Y));
    v.forEach((row, i) => { for (const k of Object.keys(g.realSample[i])) assert.ok(close(row[k], g.realSample[i][k]), `${row.Y} ${k}`); });
  });
}

// Python v2 encodes the older assumptions: Generali as a 0.5 Cr 2027 inflow, no premiums, NSE 1.02 Cr sold 2030 flat.
const LEGACY = { genPrem: 0, genInc: false, nseYear: 2030, nseG: 0 };
const CASES: Record<string, Partial<Params>> = { A: { esopYear: 2028, esopH: 0 }, B: { esopYear: 2028, esopH: 25 }, C: { esopYear: 2030, esopH: 25 } };
for (const name of Object.keys(PY)) {
  const [c, mode] = name.split("_");
  const P: Params = { ...cloneParams(), ...LEGACY, ...CASES[c], shiftOn: mode === "shift" };
  const r = compute(P, [{ year: 2027, kind: "inflow", amt: 50 }]);
  const py = PY[name];
  t(`python ${name}: deterministic path`, () => {
    for (const [y, v] of py.path as [number, number][]) {
      const row = r.rows.find((x) => x.Y === y)!;
      assert.ok(Math.abs(row.port - v) / Math.max(1, Math.abs(v)) < 1e-6, `${y}: ${row.port} vs ${v}`);
    }
  });
  t(`python ${name}: depletion year`, () => assert.equal(r.depl, py.depl));
  t(`python ${name}: Monte Carlo within sampling error`, () => {
    const m = simulate(r.rows, P, 40000);
    assert.ok(Math.abs(m.p - py.mc) < 1.5, `${m.p} vs ${py.mc}`);
  });
}

t("real view of a goal equals the entered amount", () => {
  const v = view(compute({ ...cloneParams(), marrOn: true }).rows, "real");
  assert.ok(close(v.find((x) => x.Y === 2039)!.goals, 50)); assert.ok(close(v.find((x) => x.Y === 2044)!.goals, 100));
});
t("view never scales the stage index", () => assert.equal(view(compute(cloneParams()).rows, "real").find((x) => x.Y === 2045)!.st, 2));
t("seeded: same inputs give the same probability", () => {
  const rows = compute(cloneParams()).rows;
  assert.equal(simulate(rows, cloneParams(), 2000).p, simulate(rows, cloneParams(), 2000).p);
});
t("Generali is an expense only by default: premiums 2027-2034, no income", () => {
  const rows = compute(cloneParams()).rows;
  assert.ok(rows.every((x) => x.gen === 0));
  rows.filter((x) => x.Y >= 2027 && x.Y <= 2034).forEach((x) => assert.ok(close(x.ins - 0.48, 5)));
  assert.ok(close(rows.find((x) => x.Y === 2035)!.ins, 0.48));
});
t("Generali income when enabled sums to 29.9L over 2027-2050", () => {
  const s = compute({ ...cloneParams(), genInc: true }).rows.reduce((a, x) => a + x.gen, 0);
  assert.ok(close(s, 24.481 * (5 * 0.03 + 5 * 0.04 + 5 * 0.05 + 5 * 0.06 + 5 * 0.07) - 24.481 * 0.03, 1e-9));
});
t("bands 90 / 75", () => assert.deepEqual([band(90), band(89.99), band(75), band(74.99)], ["Adequate", "Just enough", "Just enough", "Inadequate"]));

console.log(`retirement engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
