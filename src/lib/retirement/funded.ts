/**
 * Funded status — "what you'd need vs what you hold", the headline the plan-home page leads
 * with. Deliberately simple and separate from simulate()'s Monte Carlo success probability:
 * this is a single deterministic PV comparison, that answers a different question than success%.
 *
 * PV(expenses): every future year's gross expense (core+flex+health+ins+school+edu+emi+goals,
 * i.e. Row.exp — the same field the ledger and simulate() both already use), discounted back to
 * the plan's valuation date at the plan's own deterministic-path return assumption (Params.r) —
 * no new assumption to maintain, one rate feeds both the ledger's deterministic path and this PV.
 *
 * assetsHeldL: the current, undiscounted value of what's actually held today (the net-worth
 * tracker's 13 classes — see networth.ts). Deliberately NOT netted against future recurring
 * income (Ria's salary, rent, the Generali annuity, a future Sangeeth income) or one-time asset
 * unlocks (ESOP, property sale, EPF/NPS) that Row.assets/Row.inc already capture — those are
 * covered by the Monte Carlo success% right next to this number, not blended into it. This number
 * answers a narrower, starker question on purpose: "if no further income ever arrived, could
 * what I hold today alone cover every future expense?" — labelled as such in the UI so it isn't
 * mistaken for the fuller picture.
 */
import type { Row } from "./types";

/** 1 Oct 2026 — the engine's own valuation date (Row.Y===2026 is a Q4-2026 stub; matches the
 *  "valuation 1 Oct 2026" label already shown on the plan page, and retirement_model_v0.py's VAL). */
export const FUNDED_VAL_DATE = 2026.75;

export interface FundedStatus {
  pvExpensesL: number;
  assetsHeldL: number;
  deltaL: number; // assetsHeldL - pvExpensesL; negative = shortfall
  fundedRatioPct: number; // assetsHeldL / pvExpensesL * 100
  discountRatePct: number;
  valDate: number;
}

/** Discounts every row's Row.exp back to `valDate` at `ratePct`. Pure; never mutates `rows`. */
export function presentValueOfExpenses(rows: Row[], ratePct: number, valDate: number = FUNDED_VAL_DATE): number {
  const r = ratePct / 100;
  let pv = 0;
  for (const row of rows) {
    const mid = row.Y === 2026 ? 2026.875 : row.Y + 0.5;
    pv += row.exp / Math.pow(1 + r, mid - valDate);
  }
  return pv;
}

export function computeFundedStatus(
  rows: Row[],
  ratePct: number,
  assetsHeldL: number,
  valDate: number = FUNDED_VAL_DATE,
): FundedStatus {
  const pvExpensesL = presentValueOfExpenses(rows, ratePct, valDate);
  const deltaL = assetsHeldL - pvExpensesL;
  const fundedRatioPct = pvExpensesL > 0 ? (assetsHeldL / pvExpensesL) * 100 : 100;
  return { pvExpensesL, assetsHeldL, deltaL, fundedRatioPct, discountRatePct: ratePct, valDate };
}
