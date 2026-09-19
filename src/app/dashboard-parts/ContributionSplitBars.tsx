import { Card } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { HOLDER_COLORS } from "./colors";
import type { HolderCashFlow } from "./queries";

/**
 * Household-mode hero strip: two segmented bars (Income share, Expense share) so "who
 * earns more" and "who spends more" read in one glance, plus each person's savings rate.
 * Shares sum to 100% by construction — a single segmented bar per metric, not a pie
 * (per dataviz guidance: parts of a whole -> one bar, not two disconnected shapes to compare).
 */
export function ContributionSplitBars({ holders }: { holders: HolderCashFlow[] }) {
  const totalIncome = holders.reduce((s, h) => s + h.income, 0);
  const totalExpense = holders.reduce((s, h) => s + h.expense, 0);

  function segmentedBar(label: string, key: "income" | "expense", total: number) {
    return (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-xs">
          <span className="font-medium text-slate-600">{label}</span>
          <span className="text-slate-400">{formatINR(total)}</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100">
          {holders.map((h) => {
            const val = h[key];
            const pct = total > 0 ? (val / total) * 100 : 0;
            if (pct <= 0) return null;
            return (
              <div
                key={h.holder}
                style={{ width: `${pct}%`, background: HOLDER_COLORS[h.holder] }}
                title={`${h.holder}: ${formatINR(val)} (${pct.toFixed(0)}%)`}
              />
            );
          })}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500">
          {holders.map((h) => {
            const val = h[key];
            const pct = total > 0 ? (val / total) * 100 : 0;
            return (
              <span key={h.holder} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: HOLDER_COLORS[h.holder] }} />
                {h.holder} {pct.toFixed(0)}%
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <h2 className="mb-4 text-sm font-semibold text-slate-900">Household contribution — this period</h2>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {segmentedBar("Income share", "income", totalIncome)}
        {segmentedBar("Expense share", "expense", totalExpense)}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
        {holders.map((h) => (
          <div key={h.holder} className="text-xs">
            <span className="inline-flex items-center gap-1.5 font-medium text-slate-700">
              <span className="h-2 w-2 rounded-full" style={{ background: HOLDER_COLORS[h.holder] }} />
              {h.holder}
            </span>
            <div className="mt-0.5 text-slate-500">
              Savings rate: {h.savingsRate != null ? `${h.savingsRate.toFixed(0)}%` : "—"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
