// All display dates/months are rendered in Asia/Kolkata explicitly. Without this, Intl
// falls back to the server's local timezone — Render containers default to UTC, so every
// migration-era row (stored as IST-midnight-as-previous-day-UTC) was displaying one
// calendar day early. Explicit timeZone here fixes both storage conventions in the DB at
// once (see plan doc section 19) with no data migration needed.
const DISPLAY_TZ = "Asia/Kolkata";

export function formatINR(amount: number | string, opts?: { signDisplay?: "auto" | "always" | "never" }) {
  const n = typeof amount === "string" ? parseFloat(amount) : amount;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    signDisplay: opts?.signDisplay ?? "auto",
  }).format(n);
}

export function formatDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: DISPLAY_TZ }).format(date);
}

export function formatMonth(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: DISPLAY_TZ }).format(date);
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
