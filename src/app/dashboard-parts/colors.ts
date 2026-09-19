// Fixed categorical palette for ExpenseNature series, per the dataviz skill's
// validated default palette (8 hues, CVD-checked; see references/palette.md).
// Colors are assigned by nature IDENTITY in a fixed order — never by current
// rank/value — so a series keeps its color across periods and filters.
//
// There are 9 Expenditure-type natures but only 8 safe categorical slots.
// Rather than fold a real household budget category into an opaque "Other"
// bucket (the skill's guidance for long, unbounded tails), the 9th
// ("Vacation") gets a fixed neutral gray — this is a small, closed set of
// named categories the user already knows, not a long tail.
export const NATURE_COLOR_ORDER = [
  "Discretionary Expense",
  "Education Expenses",
  "Household Fixed",
  "Income Tax",
  "Insurance Premium",
  "Medical",
  "Official Expense",
  "One Off Expenses",
  "Vacation",
] as const;

const HUES = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
];

const OVERFLOW_GRAY = "#6b6a66";

export function natureColor(name: string): string {
  const idx = NATURE_COLOR_ORDER.indexOf(name as (typeof NATURE_COLOR_ORDER)[number]);
  if (idx === -1 || idx >= HUES.length) return OVERFLOW_GRAY;
  return HUES[idx];
}

// Account Type breakdown (the "by Account Type" toggle) — 3 fixed buckets, distinct hues
// from the Nature palette above so the two breakdowns never look like they share a legend.
export const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  Expenditure: "#e34948", // red — money leaving as spend
  Investment: "#2a78d6", // blue — money moved into savings/assets
  Income: "#1baf7a", // aqua — money coming in
};

// Two-person comparisons (hero contribution strip, Household split region).
export const HOLDER_COLORS: Record<string, string> = {
  Sangeeth: "#2a78d6",
  Ria: "#e87ba4",
};

// Same hex values as CashFlowTrendChart's local INCOME_COLOR/EXPENSE_COLOR — centralized here
// so the per-month Expense/Income/Investment composition cards (CategoryBars) read as visually
// part of the same system as the trend chart above them, without forcing a refactor of that
// already-working component's own local constants. `investment` matches ACCOUNT_TYPE_COLORS.
// Investment above (same blue) so the two breakdowns never disagree on Investment's color.
export const FLOW_COLORS = {
  income: "#1baf7a",
  expense: "#e34948",
  investment: "#2a78d6",
} as const;
