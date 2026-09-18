import { prisma } from "@/lib/prisma";
import { pctChange } from "@/lib/format";

/**
 * Data access + pure aggregation helpers for the Insights & Trends screen.
 *
 * Approach: two SQL GROUP BY queries (by expenseType-month, and by account-month) pull
 * pre-aggregated rows straight out of the DB — never the full 16k-row transaction table.
 * Both result sets are small (a couple thousand rows at most, one row per month x type/account
 * that actually had activity), so everything downstream (YoY bucketing, seasonality, the trend
 * explorer, anomaly detection) is plain-JS reduction over those already-aggregated rows rather
 * than a fresh query per view. This file is shared by the page (Server Component) and the CSV
 * export Route Handler so both stay in sync.
 *
 * DUAL-DIALECT: this file runs against SQLite locally and Postgres (Supabase) in production —
 * the two raw queries differ enough (below) that a single query string can't cover both, so we
 * branch on `IS_POSTGRES` (checked at module load from DATABASE_URL, not the schema.prisma
 * provider — that only affects what Prisma Client itself expects to connect to). Verified
 * end-to-end against a real Postgres 16 instance (2026-09-12): identical row counts and totals
 * to the SQLite path over the same data.
 *   - SQLite has no native DATETIME: txnDate is epoch-millis, so month-bucketing needs
 *     strftime('%Y-%m', txnDate/1000, 'unixepoch'), and SUM() must be CAST(...AS REAL) or
 *     Prisma's raw-query engine infers bigint from the underlying integer affinity and throws
 *     on a fractional total.
 *   - Postgres stores txnDate as a native timestamp (TO_CHAR(...,'YYYY-MM') instead), requires
 *     every selected non-aggregate column to appear in GROUP BY (SQLite is lax about this), and
 *     needs double-quoted camelCase identifiers ("categoryId", not categoryId — unquoted
 *     identifiers get silently lowercased and won't match the actual column).
 */

const IS_POSTGRES = (process.env.DATABASE_URL ?? "").startsWith("postgres");

export type MonthlyTypeRow = {
  ym: string; // "YYYY-MM"
  natureId: string;
  natureName: string;
  typeId: string;
  typeName: string;
  spend: number; // positive INR
};

export type MonthlyAccountRow = {
  ym: string;
  accountId: string | null;
  accountName: string | null;
  holder: string | null;
  spend: number; // positive INR
};

export type NatureOption = { id: string; name: string };
export type TypeOption = { id: string; name: string; natureId: string; natureName: string };

// Expenditure-nature, outflow (amount < 0) transactions only — this is "spend" throughout the
// page. Investment and Income natures are excluded by design (this screen is about spend
// trends, not net worth). Transactions with no category (175 of 16,368, mostly needs_review
// rows) are necessarily excluded too since nature/type is derived via the category's chain —
// they're a small, honest gap noted in the anomaly/coverage copy rather than papered over.
export async function getMonthlyByType(): Promise<MonthlyTypeRow[]> {
  const sql = IS_POSTGRES
    ? `
    SELECT
      TO_CHAR(t."txnDate", 'YYYY-MM') as ym,
      n.id as "natureId", n.name as "natureName",
      et.id as "typeId", et.name as "typeName",
      CAST(SUM(t.amount) AS DOUBLE PRECISION) as total
    FROM transactions t
    JOIN categories c ON t."categoryId" = c.id
    JOIN expense_types et ON c."expenseTypeId" = et.id
    JOIN expense_natures n ON et."expenseNatureId" = n.id
    WHERE n."accountType" = 'Expenditure' AND t.amount < 0
    GROUP BY ym, et.id, n.id, n.name, et.name
  `
    : `
    SELECT
      strftime('%Y-%m', t.txnDate / 1000, 'unixepoch') as ym,
      n.id as natureId, n.name as natureName,
      et.id as typeId, et.name as typeName,
      CAST(SUM(t.amount) AS REAL) as total
    FROM transactions t
    JOIN categories c ON t.categoryId = c.id
    JOIN expense_types et ON c.expenseTypeId = et.id
    JOIN expense_natures n ON et.expenseNatureId = n.id
    WHERE n.accountType = 'Expenditure' AND t.amount < 0
    GROUP BY ym, et.id
  `;
  const rows = await prisma.$queryRawUnsafe<
    { ym: string; natureId: string; natureName: string; typeId: string; typeName: string; total: number }[]
  >(sql);
  return rows.map((r) => ({ ...r, spend: -r.total }));
}

export async function getMonthlyByAccount(): Promise<MonthlyAccountRow[]> {
  const sql = IS_POSTGRES
    ? `
    SELECT
      TO_CHAR(t."txnDate", 'YYYY-MM') as ym,
      a.id as "accountId", a.name as "accountName", a.holder as holder,
      CAST(SUM(t.amount) AS DOUBLE PRECISION) as total
    FROM transactions t
    JOIN categories c ON t."categoryId" = c.id
    JOIN expense_types et ON c."expenseTypeId" = et.id
    JOIN expense_natures n ON et."expenseNatureId" = n.id
    LEFT JOIN accounts a ON t."accountId" = a.id
    WHERE n."accountType" = 'Expenditure' AND t.amount < 0
    GROUP BY ym, a.id, a.name, a.holder
  `
    : `
    SELECT
      strftime('%Y-%m', t.txnDate / 1000, 'unixepoch') as ym,
      a.id as accountId, a.name as accountName, a.holder as holder,
      CAST(SUM(t.amount) AS REAL) as total
    FROM transactions t
    JOIN categories c ON t.categoryId = c.id
    JOIN expense_types et ON c.expenseTypeId = et.id
    JOIN expense_natures n ON et.expenseNatureId = n.id
    LEFT JOIN accounts a ON t.accountId = a.id
    WHERE n.accountType = 'Expenditure' AND t.amount < 0
    GROUP BY ym, a.id
  `;
  const rows = await prisma.$queryRawUnsafe<
    { ym: string; accountId: string | null; accountName: string | null; holder: string | null; total: number }[]
  >(sql);
  return rows.map((r) => ({ ...r, spend: -r.total }));
}

export async function getExpenditureNatures(): Promise<NatureOption[]> {
  const rows = await prisma.expenseNature.findMany({
    where: { accountType: "Expenditure" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  return rows;
}

export async function getExpenditureTypes(): Promise<TypeOption[]> {
  const rows = await prisma.expenseType.findMany({
    where: { expenseNature: { accountType: "Expenditure" } },
    select: { id: true, name: true, expenseNature: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, natureId: r.expenseNature.id, natureName: r.expenseNature.name }));
}

// ---- Year bucketing (Calendar vs Fiscal, computed live from the "YYYY-MM" key) ----

export type ViewMode = "cal" | "fy";

export function yearBucket(ym: string, view: ViewMode): { label: string; sortKey: number } {
  const y = parseInt(ym.slice(0, 4), 10);
  const m = parseInt(ym.slice(5, 7), 10);
  if (view === "cal") return { label: String(y), sortKey: y };
  // Fiscal year: Apr(y)..Mar(y+1) => "FY y-(y+1)"
  if (m >= 4) return { label: `FY ${y}-${String((y + 1) % 100).padStart(2, "0")}`, sortKey: y };
  return { label: `FY ${y - 1}-${String(y % 100).padStart(2, "0")}`, sortKey: y - 1 };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function monthLabel(ym: string): string {
  const y = ym.slice(0, 4);
  const m = parseInt(ym.slice(5, 7), 10);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

// ---- Year multi-select (the global "which years to consider" filter) ----
//
// Reuses yearBucket's sortKey as the year identity so the filter lines up exactly with
// whatever grouping (Calendar/Fiscal) the page is currently displaying: sortKey is the
// calendar year itself in "cal" view, or the FY's starting calendar year in "fy" view.

export type YearOption = { sortKey: number; label: string };

export function getAvailableYears(rows: MonthlyTypeRow[], view: ViewMode): YearOption[] {
  const byKey = new Map<number, string>();
  for (const r of rows) {
    const { label, sortKey } = yearBucket(r.ym, view);
    if (!byKey.has(sortKey)) byKey.set(sortKey, label);
  }
  return [...byKey.entries()].sort((a, b) => a[0] - b[0]).map(([sortKey, label]) => ({ sortKey, label }));
}

export function parseYearsParam(v: string | undefined): Set<number> | null {
  if (!v) return null; // null = "all years", the default — distinct from an empty selection
  const keys = v
    .split(",")
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
  return keys.length ? new Set(keys) : null;
}

export function filterRowsByYears<T extends { ym: string }>(rows: T[], view: ViewMode, selected: Set<number> | null): T[] {
  if (selected == null) return rows;
  return rows.filter((r) => selected.has(yearBucket(r.ym, view).sortKey));
}

// The first-ever-visit default (no URL param, no persisted cookie yet): the last 3 years
// *including the current one*, computed from the real current date — not from what data happens
// to exist yet, so a brand-new calendar/fiscal year with no transactions in it yet is still
// included rather than silently dropped. `count` includes the current year itself.
export function defaultRecentYearKeys(view: ViewMode, count = 3): number[] {
  const now = new Date();
  const y = now.getFullYear();
  const currentKey = view === "cal" ? y : now.getMonth() + 1 >= 4 ? y : y - 1;
  return Array.from({ length: count }, (_, i) => currentKey - (count - 1 - i));
}

// ---- YoY ----

export type YearTotal = { label: string; sortKey: number; total: number; pctChange: number | null; partial: boolean };

export function computeYoY(
  rows: MonthlyTypeRow[],
  view: ViewMode,
  natureFilter: string | "all",
): YearTotal[] {
  const filtered = natureFilter === "all" ? rows : rows.filter((r) => r.natureId === natureFilter);
  const byYear = new Map<number, { label: string; total: number; months: Set<string> }>();
  for (const r of filtered) {
    const { label, sortKey } = yearBucket(r.ym, view);
    const bucket = byYear.get(sortKey) ?? { label, total: 0, months: new Set<string>() };
    bucket.total += r.spend;
    bucket.months.add(r.ym);
    byYear.set(sortKey, bucket);
  }
  const sortedKeys = [...byYear.keys()].sort((a, b) => a - b);
  const minKey = sortedKeys[0];
  const maxKey = sortedKeys[sortedKeys.length - 1];
  const out: YearTotal[] = [];
  let prevTotal: number | null = null;
  for (const key of sortedKeys) {
    const b = byYear.get(key)!;
    out.push({
      label: b.label,
      sortKey: key,
      total: b.total,
      pctChange: prevTotal == null ? null : pctChange(b.total, prevTotal),
      partial: (key === minKey || key === maxKey) && b.months.size < 12,
    });
    prevTotal = b.total;
  }
  return out;
}

// ---- Category trend explorer ----

export type TrendSelector = { kind: "nature" | "type"; id: string };

export function parseTrendParam(v: string | undefined, types: TypeOption[]): TrendSelector | null {
  if (!v) return null;
  const [kind, id] = v.split(":");
  if (kind === "nature" || kind === "type") return { kind, id };
  return null;
}

export function defaultTrendSelector(rows: MonthlyTypeRow[]): TrendSelector {
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.typeId, (totals.get(r.typeId) ?? 0) + r.spend);
  let bestId = rows[0]?.typeId ?? "";
  let bestTotal = -Infinity;
  for (const [id, total] of totals) {
    if (total > bestTotal) {
      bestTotal = total;
      bestId = id;
    }
  }
  return { kind: "type", id: bestId };
}

export function computeTrend(rows: MonthlyTypeRow[], view: ViewMode, sel: TrendSelector): YearTotal[] {
  const filtered = sel.kind === "type" ? rows.filter((r) => r.typeId === sel.id) : rows.filter((r) => r.natureId === sel.id);
  return computeYoY(filtered, view, "all");
}

// ---- Seasonality ----

export type SeasonalityPoint = { monthNum: number; monthName: string; avg: number; years: number };

export function computeSeasonality(rows: MonthlyTypeRow[]): SeasonalityPoint[] {
  // Total spend per calendar month-of-year, divided by the number of distinct calendar years
  // that month had any recorded spend — an honest per-month average across ~13 years of history.
  const totalsByMonth = new Map<number, number>();
  const yearsByMonth = new Map<number, Set<string>>();
  for (const r of rows) {
    const m = parseInt(r.ym.slice(5, 7), 10);
    const y = r.ym.slice(0, 4);
    totalsByMonth.set(m, (totalsByMonth.get(m) ?? 0) + r.spend);
    if (!yearsByMonth.has(m)) yearsByMonth.set(m, new Set());
    yearsByMonth.get(m)!.add(y);
  }
  const out: SeasonalityPoint[] = [];
  for (let m = 1; m <= 12; m++) {
    const years = yearsByMonth.get(m)?.size ?? 0;
    const total = totalsByMonth.get(m) ?? 0;
    out.push({ monthNum: m, monthName: MONTH_NAMES[m - 1], avg: years > 0 ? total / years : 0, years });
  }
  return out;
}

// ---- Account-level ----

export type AccountTotal = {
  accountId: string;
  accountName: string;
  holder: string;
  total: number;
  txnMonths: number;
};

export function computeAccountTotals(rows: MonthlyAccountRow[]): AccountTotal[] {
  const byAccount = new Map<string, AccountTotal>();
  for (const r of rows) {
    const id = r.accountId ?? "__unattributed__";
    const name = r.accountName ?? "Unattributed (no linked account)";
    const holder = r.holder ?? "—";
    const cur = byAccount.get(id) ?? { accountId: id, accountName: name, holder, total: 0, txnMonths: 0 };
    cur.total += r.spend;
    cur.txnMonths += 1;
    byAccount.set(id, cur);
  }
  return [...byAccount.values()].sort((a, b) => b.total - a.total);
}

export function computeAccountYearly(
  rows: MonthlyAccountRow[],
  view: ViewMode,
  topAccountIds: string[],
): { year: string; sortKey: number; [accountKey: string]: number | string }[] {
  const byYear = new Map<number, { label: string; values: Map<string, number> }>();
  for (const r of rows) {
    const { label, sortKey } = yearBucket(r.ym, view);
    const id = r.accountId ?? "__unattributed__";
    const key = topAccountIds.includes(id) ? id : "__other__";
    const bucket = byYear.get(sortKey) ?? { label, values: new Map<string, number>() };
    bucket.values.set(key, (bucket.values.get(key) ?? 0) + r.spend);
    byYear.set(sortKey, bucket);
  }
  const sortedKeys = [...byYear.keys()].sort((a, b) => a - b);
  return sortedKeys.map((k) => {
    const b = byYear.get(k)!;
    const row: { year: string; sortKey: number; [accountKey: string]: number | string } = { year: b.label, sortKey: k };
    for (const [key, val] of b.values) row[key] = val;
    return row;
  });
}

// ---- Anomalies ----

export type Anomaly = {
  typeName: string;
  natureName: string;
  ym: string;
  spend: number;
  mean: number;
  ratio: number;
  z: number;
};

export function computeAnomalies(rows: MonthlyTypeRow[], minMonths = 6, zThreshold = 2): Anomaly[] {
  const byType = new Map<string, { typeName: string; natureName: string; points: { ym: string; spend: number }[] }>();
  for (const r of rows) {
    const cur = byType.get(r.typeId) ?? { typeName: r.typeName, natureName: r.natureName, points: [] };
    cur.points.push({ ym: r.ym, spend: r.spend });
    byType.set(r.typeId, cur);
  }
  const anomalies: Anomaly[] = [];
  for (const { typeName, natureName, points } of byType.values()) {
    if (points.length < minMonths) continue;
    const mean = points.reduce((s, p) => s + p.spend, 0) / points.length;
    const variance = points.reduce((s, p) => s + (p.spend - mean) ** 2, 0) / points.length;
    const stddev = Math.sqrt(variance);
    if (stddev <= 0) continue;
    for (const p of points) {
      const z = (p.spend - mean) / stddev;
      if (z > zThreshold) {
        anomalies.push({ typeName, natureName, ym: p.ym, spend: p.spend, mean, ratio: p.spend / mean, z });
      }
    }
  }
  anomalies.sort((a, b) => b.z - a.z);
  return anomalies;
}

// ---- CSV ----

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}
