import type { Assumptions, Baseline, Params, SubBucket } from "./types";

export const L = 100;

export const SUBS: SubBucket[] = [
  { k: "food", n: "Food and groceries", b: "core" }, { k: "home", n: "Home upkeep and staff", b: "core" },
  { k: "transport", n: "Transport", b: "core" }, { k: "utilities", n: "Utilities and connectivity", b: "core" },
  { k: "shopping", n: "Shopping and home goods", b: "flex" }, { k: "dining", n: "Dining and celebrations", b: "flex" },
  { k: "learning", n: "Learning and advisory", b: "flex" }, { k: "giving", n: "Giving and gifts", b: "flex" },
  { k: "subs", n: "Subscriptions", b: "flex" }, { k: "care", n: "Personal care", b: "flex" },
  { k: "travel", n: "Travel and vacation", b: "flex" }, { k: "other", n: "Other discretionary", b: "flex" },
];

/** LTM Sep 2025 to Aug 2026 from hub categories (the values used in Runway Ledger v10). */
export const DEFAULT_BASELINE: Baseline = {
  openingPoolL: 7.55 * L,
  subMonthlyL: {
    food: 0.49, home: 0.52, transport: 0.15, utilities: 0.05,
    shopping: 0.44, dining: 0.17, learning: 0.16, giving: 0.24, subs: 0.14, care: 0.06, travel: 1.02, other: 0.20,
  },
  healthAnnualL: 2.76, insAnnualL: 0.48, schoolAnnualL: 11.88, emiMonthlyL: 2.13,
  rentAnnualL: 3.4, epfL: 69, genSumAssuredL: 24.481,
};

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  epfG: 7, sangG: 5,
  mcMean: 0.0875, mcSigma: 0.12, cpiSd: 0.015, seed: 7,
};

/** Generali Option 1 guaranteed-income rate by policy year (policy no. 01878040). */
export function genRate(policyYear: number): number {
  return policyYear <= 5 ? 0.03 : policyYear <= 10 ? 0.04 : policyYear <= 15 ? 0.05 : policyYear <= 20 ? 0.06 : 0.07;
}

export const DEFAULT_PARAMS: Params = {
  r: 8, cpi: 6, med: 8, edu: 8,
  propYear: 2026, propAmt: 1.5,
  esopYear: 2028, esopH: 25, esopAmt: 12.6,
  genYear: 0, genAmt: 0, genPrem: 5, genLast: 2034, genInc: false, nseG: 8,
  nseYear: 0, nseAmt: 1.02,
  epfYear: 2042,
  riaLast: 2042, riaNet: 37.3, riaG: 5,
  sangFrom: 2028, sangTo: 2040, sangNet: 0,
  rubenUG: 2031, rochUG: 2036, ugCost: 50, pgCost: 100,
  termLast: 2039, healthRamp: 2044,
  stepYear: 0, stepPct: 15, lifeYear: 0, lifePct: 30,
  marrOn: false, marr1Year: 2039, marr1Amt: 50, marr2Year: 2044, marr2Amt: 100,
  shiftOn: true, st: [2031, 2042, 2052, 2062],
  mult: {
    food: [1, 0.8, 0.7, 0.7, 0.65], home: [1, 1, 1, 1.1, 1.25], transport: [1, 1, 0.9, 0.7, 0.5], utilities: [1, 1, 1, 1, 1],
    shopping: [1, 0.8, 0.7, 0.5, 0.35], dining: [1, 1.1, 1.1, 0.8, 0.5], learning: [1, 0.5, 0.3, 0.2, 0.2], giving: [1, 1.2, 1, 1, 1],
    subs: [1, 1.1, 1, 1, 0.9], care: [1, 1, 1, 1.2, 1.5], travel: [1, 0.8, 1.3, 0.7, 0.2], other: [1, 0.9, 0.8, 0.7, 0.6],
  },
};

export function cloneParams(p: Params = DEFAULT_PARAMS): Params { return JSON.parse(JSON.stringify(p)) as Params; }
