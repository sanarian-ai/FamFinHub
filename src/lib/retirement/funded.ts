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

/** Discounts one per-row series back to `valDate` at `ratePct`, using the engine's own mid-year
 *  convention (Row.Y===2026 is a Q4-2026 stub at 2026.875). Pure; never mutates `rows`. Shared by
 *  presentValueOfExpenses (selects Row.exp) and presentValueByCategory (selects one expense field
 *  at a time) so both use exactly the same discounting math - never two competing PV formulas. */
function presentValueOfSeries(rows: Row[], ratePct: number, valDate: number, selector: (row: Row) => number): number {
  const r = ratePct / 100;
  let pv = 0;
  for (const row of rows) {
    const mid = row.Y === 2026 ? 2026.875 : row.Y + 0.5;
    pv += selector(row) / Math.pow(1 + r, mid - valDate);
  }
  return pv;
}

/** Discounts every row's Row.exp back to `valDate` at `ratePct`. Pure; never mutates `rows`. */
export function presentValueOfExpenses(rows: Row[], ratePct: number, valDate: number = FUNDED_VAL_DATE): number {
  return presentValueOfSeries(rows, ratePct, valDate, (row) => row.exp);
}

export interface ExpenseCategoryPV {
  key: string;
  label: string;
  pvL: number;
}

export type ExpenseCategoryKey = "core" | "flex" | "health" | "ins" | "school" | "edu" | "emi" | "goals";

/** The 8 fields that sum to Row.exp (see engine.ts's `const exp = core + flex + health + ins +
 *  school + edu + emi + goals`) - the categories a user would actually recognise, not the 12
 *  spend sub-buckets folded into core/flex (that finer cut lives in the year-by-year ledger).
 *  Exported so the year-by-year-by-category view (CategoryLedger.tsx) uses these exact same
 *  keys/labels rather than a second, driftable copy. */
export const EXPENSE_CATEGORIES: { key: ExpenseCategoryKey; label: string }[] = [
  { key: "core", label: "Core living (housing, food, transport, utilities, staff)" },
  { key: "flex", label: "Flexible spend (lifestyle, dining, travel, learning, giving, subs)" },
  { key: "health", label: "Health" },
  { key: "ins", label: "Insurance premiums" },
  { key: "school", label: "School & activities" },
  { key: "edu", label: "Higher education (UG/PG)" },
  { key: "emi", label: "EMI" },
  { key: "goals", label: "Goals & one-off events" },
];

/** Same PV as presentValueOfExpenses, split by category. The eight pvL values sum to
 *  presentValueOfExpenses(rows, ratePct, valDate) exactly, since both walk the same rows with the
 *  same discount factors - verified in scripts/retirement/test-funded.ts. */
export function presentValueByCategory(rows: Row[], ratePct: number, valDate: number = FUNDED_VAL_DATE): ExpenseCategoryPV[] {
  return EXPENSE_CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    pvL: presentValueOfSeries(rows, ratePct, valDate, (row) => row[c.key] as number),
  }));
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
