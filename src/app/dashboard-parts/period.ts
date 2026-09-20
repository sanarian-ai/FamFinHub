// Pure date-math for the dashboard's period selector. No Prisma here — this
// module just carves up dates into ranges so it stays trivially testable.

export type PeriodKind = "month" | "year";
export type YearView = "cal" | "fy";

export interface PeriodRange {
  /** inclusive, UTC midnight */
  start: Date;
  /** exclusive, UTC midnight */
  end: Date;
  label: string;
}

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/** The starting calendar year of the Apr–Mar fiscal year containing `date`. */
export function fyYearOf(date: Date): number {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based; April = 3
  return m >= 3 ? y : y - 1;
}

export function monthRange(date: Date): PeriodRange {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  const start = utc(y, m, 1);
  const end = utc(y, m + 1, 1);
  return {
    start,
    end,
    label: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(start),
  };
}

export function calYearRange(date: Date): PeriodRange {
  const y = date.getUTCFullYear();
  return { start: utc(y, 0, 1), end: utc(y + 1, 0, 1), label: `Jan–Dec ${y}` };
}

export function fyRange(date: Date): PeriodRange {
  const fy = fyYearOf(date);
  return {
    start: utc(fy, 3, 1),
    end: utc(fy + 1, 3, 1),
    label: `FY ${fy}-${String(fy + 1).slice(-2)}`,
  };
}

export function getPeriod(kind: PeriodKind, view: YearView, anchor: Date): PeriodRange {
  if (kind === "year") return view === "fy" ? fyRange(anchor) : calYearRange(anchor);
  return monthRange(anchor);
}

export function previousPeriod(kind: PeriodKind, view: YearView, current: PeriodRange): PeriodRange {
  if (kind === "month") {
    const prevAnchor = new Date(current.start);
    prevAnchor.setUTCMonth(prevAnchor.getUTCMonth() - 1);
    return monthRange(prevAnchor);
  }
  const prevAnchor = new Date(current.start);
  prevAnchor.setUTCFullYear(prevAnchor.getUTCFullYear() - 1);
  return view === "fy" ? fyRange(prevAnchor) : calYearRange(prevAnchor);
}

/**
 * Same period, one year back. For month periods this differs from
 * previousPeriod (same month, not the prior month). For year-length periods
 * (cal/fy) this collapses onto the same range as previousPeriod — there's
 * only one "previous year" — which is expected, not a bug.
 */
export function samePeriodLastYear(kind: PeriodKind, view: YearView, current: PeriodRange): PeriodRange {
  const anchorShifted = new Date(current.start);
  anchorShifted.setUTCFullYear(anchorShifted.getUTCFullYear() - 1);
  return getPeriod(kind, view, anchorShifted);
}

/** The `n` months ending in the month containing `anchor`, oldest first. */
export function trailingMonths(anchor: Date, n = 12): PeriodRange[] {
  const anchorMonthStart = utc(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1);
  const months: PeriodRange[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(anchorMonthStart);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push(monthRange(d));
  }
  return months;
}

/** Whole calendar months spanned by [start, end) — e.g. Jul 1 to Oct 1 is 3. Works for both a
 *  multi-month Month-mode range and a multi-year Year-mode range (a year is just 12 of these),
 *  so callers don't need to special-case granularity to compute a per-month average. */
export function monthsBetween(start: Date, end: Date): number {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + (end.getUTCMonth() - start.getUTCMonth());
}

export function monthShortLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "2-digit" }).format(date);
}

// Household view toggle — "household" means combined (both holders), otherwise scoped to
// one person's own accounts. Kept here alongside the period types since both live in the
// same URL-param family on the Dashboard.
export type Holder = "Sangeeth" | "Ria";
export type PersonView = "household" | Holder;

export const HOLDERS: Holder[] = ["Sangeeth", "Ria"];
