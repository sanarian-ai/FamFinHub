// Shared (server + client) types for the Spend Review screen. Pure data shapes only.
export type Group = "committed" | "controllable" | "planned" | "other";

export type SrCat = {
  id: string; // Category.id — used to deep-link into the Ledger
  n: string; // category name
  t: string; // expense type name
  nat: string; // expense nature name
  g: Group; // spend group derived from the nature
  med: number; // median single-charge size across the loaded history (for the "x times usual" rule)
  by: number[][]; // by[holderIdx][monthIdx] — outflow in rupees (positive)
};

export type SrTx = {
  m: number; // month index into SrData.months
  c: number; // index into SrData.cats
  h: number; // holder index into SrData.holders
  a: number; // amount in rupees (positive)
  d: string; // raw description, trimmed
};

export type SrData = {
  months: string[]; // "YYYY-MM", ascending, contiguous
  partialLast: boolean; // true when the last month is the current, unfinished month
  holders: string[]; // ["Sangeeth", "Ria", "Other"]
  cats: SrCat[];
  tx: SrTx[]; // only charges at or above MIN_TX
};

/** Smallest charge shipped to the client; also the floor for the "large charge" multiple rule. */
export const MIN_TX = 7500;

/** Expense Nature -> spend group. Mirrors the mapping the user already maintains; unknown natures fall into "other". */
export const NATURE_GROUP: Record<string, Group> = {
  "Household Fixed": "committed",
  "Education Expenses": "committed",
  Medical: "committed",
  "Insurance Premium": "committed",
  "Discretionary Expense": "controllable",
  "Official Expense": "controllable",
  Vacation: "planned",
  "Income Tax": "other",
  "One Off Expenses": "other",
};
