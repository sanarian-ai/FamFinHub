/**
 * "What breaks the plan" — after the verdict, the screen must answer what the top-3 risks are.
 * Pure (no DB): runs the same evaluate() used everywhere else against a fixed list of
 * one-variable shocks, and reports the 3 that hurt successPct the most.
 *
 * The shock list is a deliberate, visible, editable-in-code set of "what if" scenarios — not a
 * generic derivative/elasticity computation — so each one reads as something a person actually
 * asked about (weaker markets, retiring early, an ESOP haircut), matching gate G7 (planning, not
 * advice): these are scenarios, not a recommendation.
 *
 * Each shock edits the whole PlanState, not just Params: successPct comes from simulate(), which
 * draws Monte Carlo returns from `assumptions.mcMean`/`mcSigma` — NOT from `params.r` (that field
 * only drives the single smooth deterministic path/depletion year). A shock on `params.r` alone
 * would move depletionYear but leave successPct, and therefore its ranking here, untouched — this
 * was caught by a test that asserts every shock actually moves the number it's ranked on.
 */
import type { PlanState } from "./store";
import { evaluate } from "./store";

export interface Shock {
  key: string;
  label: string;
  apply: (s: PlanState) => PlanState;
}

export const SHOCKS: Shock[] = [
  { key: "returnDown", label: "Average return 1pp lower", apply: (s) => ({ ...s, assumptions: { ...s.assumptions, mcMean: s.assumptions.mcMean - 0.01 } }) },
  { key: "cpiUp", label: "Inflation (CPI) 1pp higher", apply: (s) => ({ ...s, params: { ...s.params, cpi: s.params.cpi + 1 } }) },
  { key: "medUp", label: "Medical inflation 2pp higher", apply: (s) => ({ ...s, params: { ...s.params, med: s.params.med + 2 } }) },
  { key: "eduUp", label: "Education inflation 2pp higher", apply: (s) => ({ ...s, params: { ...s.params, edu: s.params.edu + 2 } }) },
  { key: "esopHaircut", label: "ESOP haircut 10pp worse", apply: (s) => ({ ...s, params: { ...s.params, esopH: Math.min(100, s.params.esopH + 10) } }) },
  { key: "esopDelay", label: "ESOP delayed 2 years", apply: (s) => ({ ...s, params: { ...s.params, esopYear: s.params.esopYear + 2 } }) },
  { key: "riaEarly", label: "Ria retires 2 years early", apply: (s) => ({ ...s, params: { ...s.params, riaLast: Math.max(2027, s.params.riaLast - 2) } }) },
];

export interface SensitivityResult {
  key: string;
  label: string;
  baselineSuccessPct: number;
  shockedSuccessPct: number;
  deltaPct: number; // shocked - baseline; negative = worse
  baselineDepletionYear: number | null;
  shockedDepletionYear: number | null;
}

/**
 * Runs every shock in SHOCKS against `state` and returns the 3 with the largest drop in
 * successPct (most negative deltaPct first). Never mutates `state` — each shock returns a new
 * object. Deterministic: same state + same paths always gives the same ranking and the same
 * numbers (fixed seed in assumptions.seed), so this is golden-fixture-testable like the rest of
 * the engine.
 */
export function computeSensitivities(state: PlanState, paths = 10000): SensitivityResult[] {
  const base = evaluate(state, paths);
  const all: SensitivityResult[] = SHOCKS.map((s) => {
    const shockedState = s.apply(state);
    const shocked = evaluate(shockedState, paths);
    return {
      key: s.key, label: s.label,
      baselineSuccessPct: base.successPct, shockedSuccessPct: shocked.successPct,
      deltaPct: Math.round((shocked.successPct - base.successPct) * 100) / 100,
      baselineDepletionYear: base.depletionYear, shockedDepletionYear: shocked.depletionYear,
    };
  });
  return all.sort((a, b) => a.deltaPct - b.deltaPct).slice(0, 3);
}
