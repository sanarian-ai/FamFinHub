import Link from "next/link";
import clsx from "clsx";
import { Card } from "@/components/ui";
import type { Row, ExpenseCategoryKey } from "@/lib/retirement";
import { EXPENSE_CATEGORIES } from "@/lib/retirement";
import { UnitToggle } from "../plan/Ledger";

const fmtL = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Short column headers — the full label (same text as the "By category" PV table above) shows on
// hover via title=, so the two views always describe a category identically, just at different zoom.
const SHORT_LABEL: Record<ExpenseCategoryKey, string> = {
  core: "Core",
  flex: "Flex",
  health: "Health",
  ins: "Insurance",
  school: "School",
  edu: "Education",
  emi: "EMI",
  goals: "Goals",
};

/**
 * Year-by-year expense ledger, broken into the same 8 categories as the "By category" PV table
 * above it — added alongside the existing year-by-year *net* ledger (Ledger.tsx, on
 * /retirement/stress: income/expense/net/assets/portfolio per year), not a replacement for it.
 * Same Row fields, same real/nominal toggle, same no-duplication rule: nothing here is computed
 * specially, every column is just one of the fields view() already produces on each Row.
 *
 * `highlightKey` drives the drill-down from the PV table: clicking a category there links here
 * with `?highlight=<key>#by-year-category`, tinting that one column so it's easy to find in an
 * 8-column table without adding client-side JS to a page that's otherwise plain server-rendered.
 */
export function CategoryLedger({
  rows, unit, basePath, highlightKey,
}: {
  rows: Row[]; unit: "real" | "nominal"; basePath: string; highlightKey: ExpenseCategoryKey | null;
}) {
  return (
    <Card>
      <div id="by-year-category" className="scroll-mt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Year-by-year, by category</h2>
            <span className="text-xs text-slate-500">
              Same 8 categories as the table above, one column each. Total matches the year-by-year net ledger&apos;s
              Expense column.
            </span>
          </div>
          <UnitToggle unit={unit} basePath={basePath} />
        </div>
        <div className="max-h-[520px] overflow-y-auto overflow-x-auto rounded-lg border border-slate-100">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-2 pl-3 pr-3 font-medium">Year</th>
                {EXPENSE_CATEGORIES.map((c) => (
                  <th
                    key={c.key}
                    title={c.label}
                    className={clsx(
                      "py-2 pr-3 text-right font-medium",
                      highlightKey === c.key && "bg-blue-50 text-blue-700",
                    )}
                  >
                    {SHORT_LABEL[c.key]}
                  </th>
                ))}
                <th className="py-2 pr-3 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.Y} className="border-b border-slate-50">
                  <td className="py-1.5 pl-3 pr-3 text-slate-700">{r.Y}</td>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <td
                      key={c.key}
                      className={clsx(
                        "py-1.5 pr-3 text-right tabular-nums text-slate-600",
                        highlightKey === c.key && "bg-blue-50/60 font-medium text-blue-700",
                      )}
                    >
                      {fmtL(r[c.key] as number)}
                    </td>
                  ))}
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium text-slate-800">{fmtL(r.exp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {highlightKey && (
          <div className="mt-2 text-xs text-slate-500">
            Highlighting <span className="font-medium text-blue-700">{EXPENSE_CATEGORIES.find((c) => c.key === highlightKey)?.label}</span> —{" "}
            <Link href={basePath} className="font-medium text-slate-600 hover:text-slate-900">
              clear
            </Link>
          </div>
        )}
      </div>
    </Card>
  );
}
