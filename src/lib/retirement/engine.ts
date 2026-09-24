import { DEFAULT_ASSUMPTIONS, DEFAULT_BASELINE, L, SUBS } from "./defaults";
import type { Assumptions, Baseline, ComputeResult, CustomEvent, McResult, Params, Row } from "./types";

export function stageOf(Y: number, P: Params): number {
  let i = 0;
  for (let j = 0; j < 4; j++) if (Y >= P.st[j]) i = j + 1;
  return i;
}

/** Deterministic year-by-year plan, 2026 (Q4 stub) to 2082. Pure: no DOM, no storage, no randomness. */
export function compute(
  P: Params,
  custom: CustomEvent[] = [],
  baseline: Baseline = DEFAULT_BASELINE,
  A: Assumptions = DEFAULT_ASSUMPTIONS,
): ComputeResult {
  const r = P.r / 100, c = P.cpi / 100, md = P.med / 100, ed = P.edu / 100;
  const out: Row[] = [];
  let port = baseline.openingPoolL;
  let depl: number | null = null;
  for (let Y = 2026; Y <= 2082; Y++) {
    const frac = Y === 2026 ? 0.25 : 1, mid = Y === 2026 ? 2026.875 : Y + 0.5;
    const idx = Math.pow(1 + c, mid - 2026.2);
    const iE = Math.pow((1 + ed) / (1 + c), mid - 2026.72) * idx;
    const iS = Math.pow((1 + ed) / (1 + c), mid - 2026.2) * idx;
    const iM = Math.pow(1 + md, mid - 2026.2);
    const st = P.shiftOn ? stageOf(Y, P) : 0;
    let core = 0, flex = 0;
    const sv: Record<string, number> = {};
    for (const u of SUBS) {
      const mu = (P.mult[u.k] || [1, 1, 1, 1, 1])[st];
      const cut = u.b === "core"
        ? ((P.stepYear && Y >= P.stepYear) ? 1 - P.stepPct / 100 : 1)
        : ((P.lifeYear && Y >= P.lifeYear) ? 1 - P.lifePct / 100 : 1);
      const v = baseline.subMonthlyL[u.k] * 12 * idx * frac * mu * cut;
      sv["s_" + u.k] = v;
      if (u.b === "core") core += v; else flex += v;
    }
    const ramp = Y >= P.healthRamp ? Math.pow(1.03, Math.min(Y - P.healthRamp + 1, 15)) : 1;
    const health = baseline.healthAnnualL * iM * ramp * frac;
    const ins = Y <= P.termLast ? baseline.insAnnualL * frac : 0;
    const sf = Y < P.rubenUG ? 1 : (Y < P.rochUG ? 0.5 : 0);
    const school = baseline.schoolAnnualL * iS * sf * frac;
    let edu = 0;
    for (const s of [P.rubenUG, P.rochUG]) {
      if (Y >= s && Y <= s + 3) edu += P.ugCost * iE;
      else if (Y >= s + 4 && Y <= s + 5) edu += P.pgCost * iE;
    }
    const emi = Y <= P.propYear ? baseline.emiMonthlyL * (Y === 2026 ? 3 : 12) : 0;
    let goals = 0, inflow = 0;
    if (P.marrOn) {
      if (Y === P.marr1Year) goals += P.marr1Amt * idx;
      if (Y === P.marr2Year) goals += P.marr2Amt * idx;
    }
    for (const ce of custom) {
      if (+ce.year !== Y) continue;
      if (ce.kind === "expense") goals += (+ce.amt || 0) * Math.pow(1 + c, Y - 2026);
      if (ce.kind === "inflow") inflow += (+ce.amt || 0);
    }
    const ria = Y <= P.riaLast
      ? (Y === 2026 ? P.riaNet * 0.25 : P.riaNet * Math.pow(1 + P.riaG / 100, Y - 2026))
      : 0;
    const rent = Y === 2026 ? baseline.rentAnnualL * 0.25 : baseline.rentAnnualL * Math.pow(1 + c, Y - 2026);
    const sang = (P.sangNet > 0 && Y >= P.sangFrom && Y <= P.sangTo)
      ? P.sangNet * Math.pow(1 + A.sangG / 100, Y - 2026) * (Y === 2026 ? 0.25 : 1)
      : 0;
    let assets = 0;
    if (Y === P.propYear) assets += P.propAmt * L;
    if (Y === P.esopYear) assets += P.esopAmt * L * (1 - P.esopH / 100);
    if (Y === P.epfYear) assets += baseline.epfL * Math.pow(1 + A.epfG / 100, Y - 2026);
    const held = Y < P.epfYear ? baseline.epfL * Math.pow(1 + A.epfG / 100, Y - 2026) : 0;
    const exp = core + flex + health + ins + school + edu + emi + goals;
    const inc = ria + rent + sang;
    const flow = inc + assets + inflow - exp;
    port = Y === 2026
      ? port * Math.pow(1 + r, 0.25) + flow * Math.pow(1 + r, 0.125)
      : port * (1 + r) + flow * Math.pow(1 + r, 0.5);
    if (port < 0 && depl === null) depl = Y;
    out.push({
      Y, idx, core, flex, health, ins, school, edu, emi, goals, ria, rent, sang, inc, exp,
      net: inc - exp, assets: assets + inflow, port, st, held, ...sv,
    });
  }
  return { rows: out, depl };
}

/** Restate a row set in today's money ("real") or leave nominal. Stage index is never scaled. */
export function view(rows: Row[], unit: "real" | "nominal"): Row[] {
  return rows.map((x) => {
    const d = unit === "real" ? x.idx : 1;
    const o: Row = { Y: x.Y } as Row;
    for (const k of Object.keys(x)) {
      if (k === "Y" || k === "idx") continue;
      o[k] = k === "st" ? x[k] : x[k] / d;
    }
    return o;
  });
}

/** Seeded uniform generator (mulberry32). Same seed gives the same stream in the browser and on the server. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Monte Carlo probability of never running out of money to 2082.
 * Insurance and EMI are nominal-flat; all other spend scales with each path's CPI index.
 * Income and asset flows are nominal fixed.
 */
export function simulate(
  rows: Row[],
  P: Params,
  n = 10000,
  baseline: Baseline = DEFAULT_BASELINE,
  A: Assumptions = DEFAULT_ASSUMPTIONS,
): McResult {
  const R = rng(A.seed);
  let spare: number | null = null;
  const gauss = (): number => {
    if (spare !== null) { const g = spare; spare = null; return g; }
    const u = R() || 1e-12, v = R(), m = Math.sqrt(-2 * Math.log(u));
    spare = m * Math.sin(2 * Math.PI * v);
    return m * Math.cos(2 * Math.PI * v);
  };
  const sigma = A.mcSigma, mean = A.mcMean, mu = Math.log(1 + mean) - sigma * sigma / 2, cs = A.cpiSd, cm = P.cpi / 100;
  const infl: number[] = [], flat: number[] = [], flow: number[] = [];
  for (const x of rows) {
    const f = x.ins + x.emi;
    flat.push(f); infl.push((x.exp - f) / x.idx); flow.push(x.inc + x.assets);
  }
  let ok = 0;
  const fails: number[] = [];
  for (let k = 0; k < n; k++) {
    let pool = baseline.openingPoolL, idx = 1, alive = true, fy = 0;
    for (let i = 0; i < rows.length && alive; i++) {
      const Y = rows[i].Y, yrs = Y === 2026 ? 0.25 : 1, mid = Y === 2026 ? 2026.875 : Y + 0.5;
      const pi = Math.min(0.15, Math.max(0, cm + cs * gauss()));
      idx = i === 0 ? Math.pow(1 + pi, mid - 2026.2) : idx * (1 + pi);
      const r = Math.exp(mu * yrs + sigma * Math.sqrt(yrs) * gauss()) - 1;
      pool = pool * (1 + r) + (flow[i] - infl[i] * idx - flat[i]) * Math.pow(1 + r, 0.5);
      if (pool < 0) { alive = false; fy = Y; }
    }
    if (alive) ok++; else fails.push(fy);
  }
  fails.sort((a, b) => a - b);
  const q = (p: number): number | null => (fails.length ? fails[Math.min(fails.length - 1, Math.floor(p * fails.length))] : null);
  return { p: (ok / n) * 100, n, med: q(0.5), p10: q(0.1) };
}

export type Band = "Adequate" | "Just enough" | "Inadequate";
/** Bands agreed 2026-09-21: Adequate 90%+, Just enough 75-89%, Inadequate below 75%. */
export function band(p: number): Band { return p >= 90 ? "Adequate" : p >= 75 ? "Just enough" : "Inadequate"; }
