import { Card } from "@/components/ui";
import { formatINR } from "@/lib/format";
import { HOLDER_COLORS } from "./colors";
import { AccountSplit } from "./AccountSplit";
import type { HolderCashFlow } from "./queries";
import type { AccountTotal } from "./aggregate";

/**
 * Household-view-only detail: income/expense/net/savings-rate side by side by person, each
 * with their own account-level drill-in (existing AccountSplit component, just pre-filtered
 * per holder). Hidden entirely once the Household/Sangeeth/Ria toggle narrows to one person —
 * a "split" of one person is redundant, so the caller only renders this in household mode.
 *
 * Data is owned by the caller (CashFlowSection), not fetched here — it tracks whichever
 * month/year range is selected in Breakdown analysis, same as the three breakdown cards above it.
 */
export function HouseholdSplit({
  holders,
  accountsByHolder,
  periodLabel,
}: {
  holders: HolderCashFlow[];
  accountsByHolder: Record<string, AccountTotal[]>;
  periodLabel: string;
}) {
  return (
    <Card>
      <h2 className="mb-1 text-sm font-semibold text-slate-900">Household split — {periodLabel}</h2>
      <p className="mb-4 text-xs text-slate-400">Sangeeth vs. Ria — income, spend, and their own accounts.</p>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {holders.map((h) => (
          <div key={h.holder}>
            <div className="mb-3 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: HOLDER_COLORS[h.holder] }} />
              <span className="text-sm font-semibold text-slate-900">{h.holder}</span>
            </div>
            <dl className="mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-400">Income</dt>
                <dd className="font-medium text-slate-900">{formatINR(h.income)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Expense</dt>
                <dd className="font-medium text-slate-900">{formatINR(h.expense)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Net</dt>
                <dd className={h.net >= 0 ? "font-medium text-emerald-600" : "font-medium text-rose-600"}>{formatINR(h.net)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">Savings rate</dt>
                <dd className="font-medium text-slate-900">{h.savingsRate != null ? `${h.savingsRate.toFixed(0)}%` : "—"}</dd>
              </div>
            </dl>
            <AccountSplit accounts={accountsByHolder[h.holder] ?? []} />
          </div>
        ))}
      </div>
    </Card>
  );
}
