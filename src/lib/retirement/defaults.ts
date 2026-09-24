import type { Assumptions, Baseline, Params, SubBucket } from "./types";

export const L = 100;

/** Birth years, for age-at-year display (e.g. the plan home page's trajectory chart tooltip).
 *  Not otherwise used by the engine — ages don't drive any computation, just labelling. */
export const BIRTH_YEAR = { sangeeth: 1984, ria: 1987 } as const;

export const SUBS: SubBucket[] = [
  { k: "food", n: "Food and groceries", b: "core" }, { k: "homeMaint", n: "Home maintenance", b: "core" },
  { k: "houseStaff", n: "House staff", b: "core" }, { k: "transport", n: "Transport", b: "core" },
  { k: "utilities", n: "Utilities and connectivity", b: "core" },
  { k: "lifestyle", n: "Lifestyle (shopping and personal care)", b: "flex" }, { k: "dining", n: "Dining and celebrations", b: "flex" },
  { k: "learning", n: "Learning", b: "flex" }, { k: "giving", n: "Giving and gifts", b: "flex" },
  { k: "subs", n: "Subscriptions and entertainment", b: "flex" },
  { k: "travel", n: "Travel and vacation", b: "flex" }, { k: "finSvc", n: "Financial service charges", b: "flex" },
];

/**
 * LTM Sep 2025 to Aug 2026, read directly from the Financer ledger (production Supabase, outflows
 * only) on 2026-09-22, after Water Softner was moved to House Maintenance and Health Insurance to
 * Medical. Each sub-bucket equals one or more whole ledger Expense Types now (see
 * retirement-baseline-ledger-mapping-proposal.md) with two named exceptions: `health` includes
 * Health Insurance (Insurance Premium nature) and `emi` is one category (TUIG EMI) out of the
 * Property Purchase Expense Type, not the whole Type (TUIG Property, the other category, is a
 * life event, not run-rate spend).
 */
export const DEFAULT_BASELINE: Baseline = {
  openingPoolL: 7.55 * L,
  subMonthlyL: {
    food: 0.4913, homeMaint: 0.2243, houseStaff: 0.4877, transport: 0.1558, utilities: 0.0527,
    lifestyle: 0.5417, dining: 0.1212, learning: 0.0711, giving: 0.2142, subs: 0.1461, travel: 1.0206, finSvc: 0.1069,
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
  // Life-stage multipliers by stage A..E. Carried forward unchanged: food, transport, utilities, dining,
  // learning, giving, subs, travel. New or changed with this reorganisation (assumptions, not
  // observed data — reviewable on the baseline screen):
  //  - homeMaint / houseStaff: the old "home" curve [1,1,1,1.1,1.25] split two ways. homeMaint keeps
  //    it unchanged (upkeep cost rising with the home's age); houseStaff assumes a steeper rise
  //    (more paid help needed later in life).
  //  - lifestyle: shopping and care's old curves blended by their LTM weight (shopping ~90%, care ~10%
  //    of the combined ₹0.542L/mo) — [1, .82, .73, .57, .47].
  //  - finSvc: no prior standalone curve existed (it was buried inside the old "other" bucket,
  //    dominated by gym, which has now moved to houseStaff). Defaulted flat pending review.
  mult: {
    food: [1, 0.8, 0.7, 0.7, 0.65], transport: [1, 1, 0.9, 0.7, 0.5], utilities: [1, 1, 1, 1, 1],
    homeMaint: [1, 1, 1, 1.1, 1.25], houseStaff: [1, 1, 1, 1.2, 1.5],
    lifestyle: [1, 0.82, 0.73, 0.57, 0.47], dining: [1, 1.1, 1.1, 0.8, 0.5], learning: [1, 0.5, 0.3, 0.2, 0.2], giving: [1, 1.2, 1, 1, 1],
    subs: [1, 1.1, 1, 1, 0.9], travel: [1, 0.8, 1.3, 0.7, 0.2], finSvc: [1, 1, 1, 1, 1],
  },
};

export function cloneParams(p: Params = DEFAULT_PARAMS): Params { return JSON.parse(JSON.stringify(p)) as Params; }
