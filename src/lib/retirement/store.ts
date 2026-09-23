/**
 * Pure (no database) helpers between the engine and the persisted plan: baseline item conversion,
 * validation, snapshots and result evaluation. Everything here is unit-tested without a DB.
 */
import { DEFAULT_ASSUMPTIONS, DEFAULT_BASELINE, DEFAULT_PARAMS, SUBS } from "./defaults";
import { band, compute, simulate } from "./engine";
import type { Band } from "./engine";
import type { Assumptions, Baseline, CustomEvent, Params, SubKey } from "./types";

/** Bump when engine behaviour changes; stored with every saved version so results stay reproducible. */
export const ENGINE_VERSION = "1.0.0";

export type BaselineGroup = "spend" | "fixed" | "asset" | "income" | "netWorth";
export type BaselineUnit = "monthly" | "annual" | "lump";

export interface BaselineItemInput {
  key: string; label: string; group: BaselineGroup; unit: BaselineUnit; valueL: number; sortOrder: number;
}

const FIXED: { key: string; label: string; group: BaselineGroup; unit: BaselineUnit; get: (b: Baseline) => number }[] = [
  { key: "health", label: "Health (annual, today's money)", group: "fixed", unit: "annual", get: (b) => b.healthAnnualL },
  { key: "insurance", label: "Insurance premiums (annual)", group: "fixed", unit: "annual", get: (b) => b.insAnnualL },
  { key: "school", label: "School and activities (annual)", group: "fixed", unit: "annual", get: (b) => b.schoolAnnualL },
  { key: "emi", label: "EMI (monthly)", group: "fixed", unit: "monthly", get: (b) => b.emiMonthlyL },
  { key: "openingPool", label: "Opening liquid pool (ex-ESOP, ex-real estate)", group: "asset", unit: "lump", get: (b) => b.openingPoolL },
  { key: "epf", label: "EPF + NPS balance", group: "asset", unit: "lump", get: (b) => b.epfL },
  { key: "rent", label: "Retained real estate rent (annual)", group: "income", unit: "annual", get: (b) => b.rentAnnualL },
  { key: "genSumAssured", label: "Generali sum assured (income base)", group: "income", unit: "lump", get: (b) => b.genSumAssuredL },
];

export const BASELINE_KEYS: string[] = [...SUBS.map((s) => "sub." + s.k), ...FIXED.map((f) => f.key)];

export function baselineToItems(b: Baseline): BaselineItemInput[] {
  const items: BaselineItemInput[] = SUBS.map((s, i) => ({
    key: "sub." + s.k, label: s.n, group: "spend", unit: "monthly", valueL: b.subMonthlyL[s.k], sortOrder: i,
  }));
  FIXED.forEach((f, i) => items.push({ key: f.key, label: f.label, group: f.group, unit: f.unit, valueL: f.get(b), sortOrder: 100 + i }));
  return items;
}

function num(v: unknown, what: string): number {
  const n = typeof v === "number" ? v : Number(String(v));
  if (!Number.isFinite(n)) throw new Error(`${what}: not a finite number (${String(v)})`);
  return n;
}

/** Rebuild a Baseline from stored items. Throws listing every missing key, so a gap can never silently become zero. */
export function itemsToBaseline(items: { key: string; valueL: unknown }[]): Baseline {
  const m = new Map(items.map((i) => [i.key, i.valueL]));
  const missing = BASELINE_KEYS.filter((k) => !m.has(k));
  if (missing.length) throw new Error("Baseline is missing: " + missing.join(", "));
  const v = (k: string) => {
    const n = num(m.get(k), k);
    if (n < 0) throw new Error(`${k}: must not be negative`);
    return n;
  };
  const subMonthlyL = {} as Record<SubKey, number>;
  for (const s of SUBS) subMonthlyL[s.k] = v("sub." + s.k);
  return {
    openingPoolL: v("openingPool"), subMonthlyL, healthAnnualL: v("health"), insAnnualL: v("insurance"),
    schoolAnnualL: v("school"), emiMonthlyL: v("emi"), rentAnnualL: v("rent"), epfL: v("epf"), genSumAssuredL: v("genSumAssured"),
  };
}

// ---------- validation ----------
const PCT: Record<string, [number, number]> = {
  r: [-5, 30], cpi: [0, 20], med: [0, 25], edu: [0, 25], nseG: [-20, 40], riaG: [-10, 30], esopH: [0, 100],
  stepPct: [0, 100], lifePct: [0, 100],
};
const YEAR_KEYS = ["propYear", "esopYear", "genYear", "genLast", "nseYear", "epfYear", "riaLast", "sangFrom", "sangTo",
  "rubenUG", "rochUG", "termLast", "healthRamp", "stepYear", "lifeYear", "marr1Year", "marr2Year"];
const ZERO_OK = new Set(["genYear", "nseYear", "stepYear", "lifeYear"]);

export function validateParams(input: unknown): Params {
  if (!input || typeof input !== "object") throw new Error("params: expected an object");
  const p = input as Record<string, unknown>;
  const errs: string[] = [];
  for (const k of Object.keys(DEFAULT_PARAMS) as (keyof Params)[]) {
    const d = DEFAULT_PARAMS[k];
    const v = p[k];
    if (v === undefined) { errs.push(`${k}: missing`); continue; }
    if (typeof d === "boolean") { if (typeof v !== "boolean") errs.push(`${k}: expected boolean`); continue; }
    if (k === "st") {
      if (!Array.isArray(v) || v.length !== 4 || v.some((x) => !Number.isInteger(x))) errs.push("st: expected 4 integer years");
      else if (!(v[0] <= v[1] && v[1] <= v[2] && v[2] <= v[3])) errs.push("st: stage years must be non-decreasing");
      continue;
    }
    if (k === "mult") {
      const m = v as Record<string, unknown>;
      for (const s of SUBS) {
        const a = m && m[s.k];
        if (!Array.isArray(a) || a.length !== 5 || a.some((x) => typeof x !== "number" || !Number.isFinite(x) || x < 0 || x > 5))
          errs.push(`mult.${s.k}: expected 5 numbers between 0 and 5`);
      }
      continue;
    }
    if (typeof v !== "number" || !Number.isFinite(v)) { errs.push(`${k}: expected a finite number`); continue; }
    if (PCT[k]) { if (v < PCT[k][0] || v > PCT[k][1]) errs.push(`${k}: ${v} outside ${PCT[k][0]}..${PCT[k][1]}`); }
    else if (YEAR_KEYS.includes(k)) {
      if (!(ZERO_OK.has(k) && v === 0) && (!Number.isInteger(v) || v < 2026 || v > 2082)) errs.push(`${k}: year must be 2026..2082`);
    } else if (v < 0) errs.push(`${k}: must not be negative`);
  }
  for (const k of Object.keys(p)) if (!(k in DEFAULT_PARAMS)) errs.push(`${k}: unknown parameter`);
  if (errs.length) throw new Error("Invalid params:\n" + errs.join("\n"));
  return p as unknown as Params;
}

export function validateAssumptions(input: unknown): Assumptions {
  if (!input || typeof input !== "object") throw new Error("assumptions: expected an object");
  const a = input as Record<string, unknown>;
  const errs: string[] = [];
  for (const k of Object.keys(DEFAULT_ASSUMPTIONS) as (keyof Assumptions)[]) {
    const v = a[k];
    if (typeof v !== "number" || !Number.isFinite(v)) errs.push(`${k}: expected a finite number`);
  }
  const n = a as unknown as Assumptions;
  if (!errs.length) {
    if (n.mcSigma <= 0 || n.mcSigma > 1) errs.push("mcSigma: expected 0..1");
    if (n.cpiSd < 0 || n.cpiSd > 0.2) errs.push("cpiSd: expected 0..0.2");
    if (n.mcMean < -0.5 || n.mcMean > 0.5) errs.push("mcMean: expected -0.5..0.5");
    if (!Number.isInteger(n.seed)) errs.push("seed: expected an integer");
  }
  for (const k of Object.keys(a)) if (!(k in DEFAULT_ASSUMPTIONS)) errs.push(`${k}: unknown assumption`);
  if (errs.length) throw new Error("Invalid assumptions:\n" + errs.join("\n"));
  return n;
}

export function validateEvent(e: { year: unknown; kind: unknown; amount: unknown; label?: unknown }): CustomEvent {
  const year = num(e.year, "year"), amt = num(e.amount, "amount");
  if (!Number.isInteger(year) || year < 2026 || year > 2082) throw new Error("event year must be 2026..2082");
  if (e.kind !== "expense" && e.kind !== "inflow") throw new Error("event kind must be expense or inflow");
  if (amt < 0) throw new Error("event amount must not be negative");
  return { year, kind: e.kind, amt, label: e.label ? String(e.label) : undefined };
}

// ---------- state, snapshot, evaluation ----------
export interface PlanState {
  params: Params; assumptions: Assumptions; baseline: Baseline; events: CustomEvent[];
}
export const defaultPlanState = (): PlanState => ({
  params: JSON.parse(JSON.stringify(DEFAULT_PARAMS)) as Params,
  assumptions: { ...DEFAULT_ASSUMPTIONS },
  baseline: JSON.parse(JSON.stringify(DEFAULT_BASELINE)) as Baseline,
  events: [],
});

export interface Evaluation { successPct: number; band: Band; depletionYear: number | null; }

/** The single function every screen and every saved version uses to turn inputs into a verdict. */
export function evaluate(s: PlanState, paths = 10000): Evaluation {
  const r = compute(s.params, s.events, s.baseline, s.assumptions);
  const m = simulate(r.rows, s.params, paths, s.baseline, s.assumptions);
  return { successPct: Math.round(m.p * 100) / 100, band: band(m.p), depletionYear: r.depl };
}

export interface Snapshot {
  engineVersion: string;
  params: Params; assumptions: Assumptions;
  baseline: (BaselineItemInput & { lastReviewedAt: string })[];
  events: CustomEvent[];
}

export function buildSnapshot(
  s: PlanState, items: (BaselineItemInput & { lastReviewedAt: Date | string })[],
): Snapshot {
  return {
    engineVersion: ENGINE_VERSION,
    params: s.params, assumptions: s.assumptions,
    baseline: items.map((i) => ({ ...i, lastReviewedAt: new Date(i.lastReviewedAt).toISOString() })),
    events: s.events,
  };
}

/** Rebuild a runnable state from a snapshot, re-validating it (a snapshot is data, not trusted code). */
export function stateFromSnapshot(snap: Snapshot): PlanState {
  return {
    params: validateParams(snap.params), assumptions: validateAssumptions(snap.assumptions),
    baseline: itemsToBaseline(snap.baseline), events: snap.events.map((e) => validateEvent({ ...e, amount: e.amt })),
  };
}
