// Split handling for portfolio quantities/prices. Raw broker figures are stored as reported;
// this converts them to current (post-split) basis at read time using CorporateAction rows.
export type SplitAction = { effectiveDate: string; ratio: number }; // YYYY-MM-DD, new shares per old share

/** Cumulative factor to apply to a raw quantity for a trade on `tradeDate` (qty × factor; price ÷ factor). */
export function splitFactor(actions: SplitAction[], tradeDate: string): number {
  let f = 1;
  for (const a of actions) if (tradeDate < a.effectiveDate) f *= a.ratio;
  return f;
}
