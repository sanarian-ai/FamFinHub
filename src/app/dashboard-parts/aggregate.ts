import type { ExpenditureRow } from "./queries";
import type { PeriodRange } from "./period";

export interface NatureTotal {
  id: string;
  name: string;
  total: number;
}

export function sumByNature(rows: ExpenditureRow[]): NatureTotal[] {
  const map = new Map<string, NatureTotal>();
  for (const r of rows) {
    const cur = map.get(r.natureId) ?? { id: r.natureId, name: r.natureName, total: 0 };
    cur.total += r.amount;
    map.set(r.natureId, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface CategoryTotal {
  id: string;
  name: string;
  total: number;
}

export function sumByCategory(rows: ExpenditureRow[]): Map<string, CategoryTotal> {
  const map = new Map<string, CategoryTotal>();
  for (const r of rows) {
    const cur = map.get(r.categoryId) ?? { id: r.categoryId, name: r.categoryName, total: 0 };
    cur.total += r.amount;
    map.set(r.categoryId, cur);
  }
  return map;
}

export interface AccountTotal {
  id: string;
  name: string;
  holder: string;
  total: number;
}

export function sumByAccount(rows: ExpenditureRow[]): AccountTotal[] {
  const map = new Map<string, AccountTotal>();
  for (const r of rows) {
    const key = r.accountId ?? "unassigned";
    const cur = map.get(key) ?? {
      id: key,
      name: r.accountName ?? "Unassigned / cash",
      holder: r.accountHolder ?? "—",
      total: 0,
    };
    cur.total += r.amount;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}

export interface MoverRow {
  id: string;
  name: string;
  current: number;
  previous: number;
  delta: number; // current - previous
  pct: number | null; // null when previous is 0 (no baseline to compute % from)
}

export function topMovers(
  currentRows: ExpenditureRow[],
  previousRows: ExpenditureRow[],
  limit = 5
): MoverRow[] {
  const cur = sumByCategory(currentRows);
  const prev = sumByCategory(previousRows);
  const ids = new Set<string>([...cur.keys(), ...prev.keys()]);
  const movers: MoverRow[] = [];
  for (const id of ids) {
    const c = cur.get(id)?.total ?? 0;
    const p = prev.get(id)?.total ?? 0;
    const name = cur.get(id)?.name ?? prev.get(id)?.name ?? "Unknown";
    const delta = c - p;
    const pct = p === 0 ? null : ((c - p) / Math.abs(p)) * 100;
    movers.push({ id, name, current: c, previous: p, delta, pct });
  }
  return movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, limit);
}

/** Buckets rows into { month: PeriodRange, byNature: Map<natureName, total> } for each month range given. */
export function bucketByMonthAndNature(rows: ExpenditureRow[], months: PeriodRange[]) {
  const buckets = months.map((m) => ({ month: m, byNature: new Map<string, number>() }));
  for (const r of rows) {
    const idx = buckets.findIndex((b) => r.txnDate >= b.month.start && r.txnDate < b.month.end);
    if (idx === -1) continue;
    const bucket = buckets[idx];
    bucket.byNature.set(r.natureName, (bucket.byNature.get(r.natureName) ?? 0) + r.amount);
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Cash flow additions
// ---------------------------------------------------------------------------

import type { FlowPoint, AccountTypeRow } from "./queries";

export interface AccountTypeTotal {
  type: "Expenditure" | "Investment" | "Income";
  total: number;
}

const ACCOUNT_TYPE_ORDER: AccountTypeTotal["type"][] = ["Expenditure", "Investment", "Income"];

export function sumByAccountType(rows: AccountTypeRow[]): AccountTypeTotal[] {
  const totals = new Map<AccountTypeTotal["type"], number>();
  for (const r of rows) totals.set(r.accountType, (totals.get(r.accountType) ?? 0) + r.amount);
  return ACCOUNT_TYPE_ORDER.filter((t) => totals.has(t)).map((t) => ({ type: t, total: totals.get(t)! }));
}

export interface CashFlowMonthPoint {
  month: PeriodRange;
  income: number;
  expense: number;
  net: number;
}

/** Buckets income/expense FlowPoints into one row per month, for the cash flow trend chart. */
export function bucketCashFlowByMonth(
  income: FlowPoint[],
  expense: FlowPoint[],
  months: PeriodRange[]
): CashFlowMonthPoint[] {
  const buckets = months.map((m) => ({ month: m, income: 0, expense: 0 }));
  const place = (rows: FlowPoint[], key: "income" | "expense") => {
    for (const r of rows) {
      const idx = buckets.findIndex((b) => r.txnDate >= b.month.start && r.txnDate < b.month.end);
      if (idx === -1) continue;
      buckets[idx][key] += r.amount;
    }
  };
  place(income, "income");
  place(expense, "expense");
  return buckets.map((b) => ({ ...b, net: b.income - b.expense }));
}
