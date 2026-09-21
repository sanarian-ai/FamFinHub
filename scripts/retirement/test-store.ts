/** M2 pure-layer tests (no database). Run: npx tsx scripts/retirement/test-store.ts */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  BASELINE_KEYS, DEFAULT_ASSUMPTIONS, DEFAULT_BASELINE, DEFAULT_PARAMS, baselineToItems, buildSnapshot, defaultPlanState,
  evaluate, itemsToBaseline, stateFromSnapshot, validateAssumptions, validateEvent, validateParams,
} from "../../src/lib/retirement";
import type { Params } from "../../src/lib/retirement";

const G = JSON.parse(fs.readFileSync(path.join(process.cwd(), "scripts", "retirement", "fixtures", "golden-v10.json"), "utf8"));
let pass = 0, fail = 0;
function t(name: string, fn: () => void) { try { fn(); pass++; } catch (e) { fail++; console.error("FAIL", name, "\n  ", (e as Error).message); } }
const throwsMsg = (fn: () => unknown, re: RegExp) => assert.throws(fn, re);
const P = (o: Record<string, unknown>) => ({ ...JSON.parse(JSON.stringify(DEFAULT_PARAMS)), ...o });

t("20 baseline keys: 12 sub-buckets + 8 fixed", () => assert.equal(BASELINE_KEYS.length, 20));
t("baseline -> items -> baseline round trips exactly", () => assert.deepEqual(itemsToBaseline(baselineToItems(DEFAULT_BASELINE)), DEFAULT_BASELINE));
t("survives Decimal(14,4) storage (values have at most 4 dp)", () => {
  const stored = baselineToItems(DEFAULT_BASELINE).map((i) => ({ ...i, valueL: Number(i.valueL.toFixed(4)) }));
  assert.deepEqual(itemsToBaseline(stored), DEFAULT_BASELINE);
});
t("default state reproduces the golden default probability", () => assert.equal(evaluate(defaultPlanState()).successPct, Math.round(G.res.default.mc.p * 100) / 100));
t("default state reproduces the golden depletion year and band", () => {
  const e = evaluate(defaultPlanState());
  assert.equal(e.depletionYear, G.res.default.depl); assert.equal(e.band, "Inadequate");
});
t("a missing baseline key is named, never treated as zero", () => {
  const items = baselineToItems(DEFAULT_BASELINE).filter((i) => i.key !== "sub.travel" && i.key !== "emi");
  throwsMsg(() => itemsToBaseline(items), /missing: sub\.travel, emi/);
});
t("negative and non-numeric baseline values are rejected", () => {
  const mk = (v: unknown) => baselineToItems(DEFAULT_BASELINE).map((i) => (i.key === "health" ? { ...i, valueL: v } : i));
  throwsMsg(() => itemsToBaseline(mk(-1)), /health: must not be negative/);
  throwsMsg(() => itemsToBaseline(mk("abc")), /health: not a finite number/);
  throwsMsg(() => itemsToBaseline(mk(NaN)), /health/);
});
t("editing the baseline changes the verdict and never mutates the defaults", () => {
  const s = defaultPlanState(); const before = evaluate(s).successPct;
  s.baseline.subMonthlyL.travel = 2.0;
  assert.ok(evaluate(s).successPct < before);
  assert.equal(DEFAULT_BASELINE.subMonthlyL.travel, 1.02);
});

t("defaults validate", () => { validateParams(DEFAULT_PARAMS); validateAssumptions(DEFAULT_ASSUMPTIONS); });
t("zero means 'none' for optional years", () => { validateParams(P({ nseYear: 0, genYear: 0, stepYear: 0, lifeYear: 0 })); });
const BAD: [string, Record<string, unknown>, RegExp][] = [
  ["return above 30%", { r: 99 }, /r: 99 outside/], ["negative cpi", { cpi: -1 }, /cpi/], ["year before 2026", { propYear: 1999 }, /propYear: year/],
  ["year after 2082", { riaLast: 2090 }, /riaLast/], ["fractional year", { esopYear: 2028.5 }, /esopYear/],
  ["haircut above 100", { esopH: 120 }, /esopH/], ["negative amount", { esopAmt: -5 }, /esopAmt: must not be negative/],
  ["string for number", { riaNet: "37" }, /riaNet: expected a finite number/], ["boolean expected", { marrOn: "yes" }, /marrOn: expected boolean/],
  ["stage years decreasing", { st: [2040, 2035, 2052, 2062] }, /non-decreasing/], ["stage array too short", { st: [2031, 2042] }, /4 integer years/],
  ["unknown key", { bogus: 1 }, /bogus: unknown parameter/],
];
for (const [name, over, re] of BAD) t(`validateParams rejects ${name}`, () => throwsMsg(() => validateParams(P(over)), re));
t("validateParams rejects a missing key", () => { const p: Record<string, unknown> = P({}); delete p.riaG; throwsMsg(() => validateParams(p), /riaG: missing/); });
t("validateParams rejects a bad multiplier row", () => {
  const p = P({}); (p as Params).mult.food = [1, 1, 1];
  throwsMsg(() => validateParams(p), /mult\.food/);
});
t("validateParams reports every problem at once", () => throwsMsg(() => validateParams(P({ r: 99, cpi: -1 })), /r: 99[\s\S]*cpi/));
t("validateAssumptions rejects out-of-range values", () => {
  throwsMsg(() => validateAssumptions({ ...DEFAULT_ASSUMPTIONS, mcSigma: 0 }), /mcSigma/);
  throwsMsg(() => validateAssumptions({ ...DEFAULT_ASSUMPTIONS, seed: 1.5 }), /seed/);
  throwsMsg(() => validateAssumptions({ ...DEFAULT_ASSUMPTIONS, extra: 1 }), /extra: unknown/);
});
t("validateEvent", () => {
  assert.deepEqual(validateEvent({ year: 2033, kind: "expense", amount: 40, label: "car" }), { year: 2033, kind: "expense", amt: 40, label: "car" });
  throwsMsg(() => validateEvent({ year: 2020, kind: "expense", amount: 1 }), /year/);
  throwsMsg(() => validateEvent({ year: 2030, kind: "gift", amount: 1 }), /kind/);
  throwsMsg(() => validateEvent({ year: 2030, kind: "inflow", amount: -1 }), /negative/);
});

t("snapshot survives JSON and reproduces the same verdict", () => {
  const s = defaultPlanState(); s.events = [{ year: 2033, kind: "expense", amt: 40 }];
  const items = baselineToItems(s.baseline).map((i) => ({ ...i, lastReviewedAt: new Date("2026-09-21T00:00:00Z") }));
  const snap = JSON.parse(JSON.stringify(buildSnapshot(s, items)));
  assert.equal(snap.engineVersion, "1.0.0");
  assert.deepEqual(evaluate(stateFromSnapshot(snap)), evaluate(s));
  assert.equal(snap.baseline[0].lastReviewedAt, "2026-09-21T00:00:00.000Z");
});
t("a tampered snapshot is rejected on load", () => {
  const s = defaultPlanState();
  const snap = JSON.parse(JSON.stringify(buildSnapshot(s, baselineToItems(s.baseline).map((i) => ({ ...i, lastReviewedAt: new Date() })))));
  snap.params.r = 500; throwsMsg(() => stateFromSnapshot(snap), /r: 500/);
});

console.log(`retirement store: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
