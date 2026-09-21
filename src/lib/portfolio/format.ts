// Display helpers for the Portfolio screens. USD uses en-US grouping, INR uses lakh/crore.
export type Cur = "USD" | "INR";

export function fmtUSD(x: number | null | undefined, dp = 0): string {
  if (x == null || !Number.isFinite(x)) return "–";
  return (x < 0 ? "-" : "") + "$" + Math.abs(x).toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtINR(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "–";
  const a = Math.abs(x), sign = x < 0 ? "-" : "";
  if (a >= 1e7) return `${sign}₹${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${sign}₹${(a / 1e5).toFixed(2)} L`;
  return `${sign}₹${a.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export const fmtMoney = (x: number | null | undefined, cur: Cur, dp = 0) => (cur === "INR" ? fmtINR(x) : fmtUSD(x, dp));

export function fmtPct(x: number | null | undefined, dp = 1, signed = false): string {
  if (x == null || !Number.isFinite(x)) return "–";
  const v = x * 100;
  if (Math.abs(v) >= 1000) return (v < 0 ? "<-" : ">") + "1,000%";
  return (signed && v > 0 ? "+" : "") + v.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) + "%";
}

export function fmtPP(x: number | null | undefined): string {
  if (x == null || !Number.isFinite(x)) return "–";
  return (x >= 0 ? "+" : "") + (x * 100).toFixed(1) + " pp";
}

export const fmtUnits = (x: number) => x.toLocaleString("en-US", { maximumFractionDigits: 4 });
export const tone = (x: number | null | undefined) => (x == null ? "" : x >= 0 ? "text-emerald-700" : "text-rose-600");

/** "2026-09-18" -> "18 Sep 2026" (calendar date, no timezone shift). */
export function fmtDay(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  return `${String(dd).padStart(2, "0")} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1]} ${y}`;
}
