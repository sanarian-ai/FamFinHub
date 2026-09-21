// Holding-period rules used for the lot "tax clock". Placeholder constants until M5 moves them into
// TaxRuleSet rows: India, foreign-listed shares, long-term when held MORE than 24 months.
// Confirm with the CA before relying on them for filing.
export const LT_MONTHS = 24;

const DAY = 86400000;
const t = (s: string) => Date.parse(`${s}T00:00:00Z`);

export function addMonthsISO(d: string, m: number): string {
  const x = new Date(t(d));
  const day = x.getUTCDate();
  x.setUTCDate(1);
  x.setUTCMonth(x.getUTCMonth() + m);
  const last = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + 1, 0)).getUTCDate();
  x.setUTCDate(Math.min(day, last));
  return x.toISOString().slice(0, 10);
}

export const daysBetween = (a: string, b: string) => Math.round((t(b) - t(a)) / DAY);

/** Long-term once the holding period exceeds LT_MONTHS. `daysToLT` is > 0 while still short-term. */
export function holdingClass(openDate: string, closeOrAsOf: string) {
  const ltDate = addMonthsISO(openDate, LT_MONTHS);
  const daysToLT = daysBetween(closeOrAsOf, ltDate) + 1; // must be held MORE than the threshold
  return { ltDate, isLong: daysToLT <= 0, daysToLT: Math.max(0, daysToLT) };
}
