/** All money in ₹ lakh (100 lakh = 1 Cr). Years are calendar years; 2026 is a Q4 stub (valuation date 1 Oct 2026). */

/**
 * Revised 2026-09-22: home upkeep split into homeMaint/houseStaff (Essential core); shopping and
 * personal care merged into lifestyle; other (gym + advisory fees) dissolved — gym joins
 * houseStaff, advisory and service fees become finSvc. Each key equals one or more whole ledger
 * Expense Types (see retirement-baseline-ledger-mapping-proposal.md) except a documented few
 * (Health Insurance -> health, TUIG EMI -> emi from the Property Purchase Type).
 */
export type SubKey =
  | "food" | "homeMaint" | "houseStaff" | "transport" | "utilities"
  | "lifestyle" | "dining" | "learning" | "giving" | "subs" | "travel" | "finSvc";

export interface SubBucket { k: SubKey; n: string; b: "core" | "flex"; }

/** Manually maintained baseline (₹L). The Financer shows ledger actuals beside these; it never overwrites them. */
export interface Baseline {
  openingPoolL: number;          // liquid pool at valuation date, ex-ESOP, ex-real estate
  subMonthlyL: Record<SubKey, number>; // ₹L per month, today's money
  healthAnnualL: number;
  insAnnualL: number;
  schoolAnnualL: number;
  emiMonthlyL: number;
  rentAnnualL: number;           // retained real estate rent, today's money
  epfL: number;                  // EPF + NPS balance at valuation date
  genSumAssuredL: number;        // Generali sum assured (guaranteed income base)
}

export interface Assumptions {
  epfG: number; sangG: number;                        // percent (r, cpi, med, edu live in Params)
  mcMean: number; mcSigma: number; cpiSd: number;     // fractions (0.0875, 0.12, 0.015)
  seed: number;
}

export interface Params {
  r: number; cpi: number; med: number; edu: number;
  propYear: number; propAmt: number;                  // amt in Cr
  esopYear: number; esopH: number; esopAmt: number;   // haircut percent, amt in Cr (post-tax)
  genYear: number; genAmt: number; genPrem: number; genLast: number; genInc: boolean;
  nseG: number; nseYear: number; nseAmt: number;
  epfYear: number;
  riaLast: number; riaNet: number; riaG: number;
  sangFrom: number; sangTo: number; sangNet: number;
  rubenUG: number; rochUG: number; ugCost: number; pgCost: number;
  termLast: number; healthRamp: number;
  stepYear: number; stepPct: number; lifeYear: number; lifePct: number;
  marrOn: boolean; marr1Year: number; marr1Amt: number; marr2Year: number; marr2Amt: number;
  shiftOn: boolean; st: [number, number, number, number];
  mult: Record<SubKey, number[]>;
}

export interface CustomEvent { year: number; label?: string; kind: "expense" | "inflow"; amt: number; }

export interface Row {
  Y: number; idx: number;
  core: number; flex: number; health: number; ins: number; school: number; edu: number; emi: number; goals: number;
  ria: number; rent: number; sang: number; gen: number;
  inc: number; exp: number; net: number; assets: number; port: number; st: number; held: number;
  [sub: string]: number;
}

export interface ComputeResult { rows: Row[]; depl: number | null; }
export interface McResult { p: number; n: number; med: number | null; p10: number | null; }
