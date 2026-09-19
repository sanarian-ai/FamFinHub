"use client";

import { useState } from "react";
import clsx from "clsx";
import { NatureDonut } from "./NatureDonut";
import { AccountTypeBars } from "./AccountTypeBars";
import { CategoryBars } from "./CategoryBars";
import type { NatureTotal, AccountTypeTotal, RankedCategoryTotals } from "./aggregate";

type Tab = "nature" | "category" | "accountType";

/**
 * Nature/Account Type/Category breakdown, in one card with a tab switcher. Which tabs render
 * is driven entirely by which optional props are passed — the original top-of-page usage
 * (Nature + Account Type only, scoped to whatever the page's Period selector is set to) keeps
 * working unchanged with no categoryData/accountTypeData required. The per-month drill-down
 * (see CashFlowSection) passes categoryData too (and, for the Income side, omits
 * accountTypeData — a single flow's Account Type split isn't a meaningful breakdown on its own).
 */
export function BreakdownCard({
  natureData,
  natureTotal,
  accountTypeData,
  accountTypeTotal,
  categoryData,
  categoryAccent,
  categoryRangeStart,
  categoryRangeEnd,
  periodLabel,
  title,
}: {
  natureData: NatureTotal[];
  natureTotal: number;
  accountTypeData?: AccountTypeTotal[];
  accountTypeTotal?: number;
  categoryData?: RankedCategoryTotals;
  categoryAccent?: string;
  categoryRangeStart?: Date;
  categoryRangeEnd?: Date;
  periodLabel: string;
  /** Overrides the tab-driven heading — used when the card's own title (e.g. "This month's
   * expense") should stay fixed regardless of which tab is active. */
  title?: string;
}) {
  const tabs: Tab[] = ["nature", ...(categoryData ? (["category"] as const) : []), ...(accountTypeData ? (["accountType"] as const) : [])];
  const [tab, setTab] = useState<Tab>("nature");
  const activeTab = tabs.includes(tab) ? tab : "nature";

  const tabLabel: Record<Tab, string> = { nature: "By Nature", category: "By Category", accountType: "By Account Type" };
  const heading: Record<Tab, string> = { nature: "Spend by nature", category: "Top categories", accountType: "By account type" };
  const caption: Record<Tab, string> = {
    nature: "Click a category to view it in the Ledger.",
    category: "Click a category to view it in the Ledger.",
    accountType: "Expenditure / Investment / Income, this period.",
  };

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          {title ?? heading[activeTab]} — {periodLabel}
        </h2>
        {tabs.length > 1 && (
          <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={clsx("rounded px-2 py-1 font-medium transition-colors", activeTab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
              >
                {tabLabel[t]}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-400">{caption[activeTab]}</p>
      {activeTab === "nature" && <NatureDonut data={natureData} total={natureTotal} />}
      {activeTab === "category" && categoryData && categoryRangeStart && categoryRangeEnd && (
        <CategoryBars
          data={categoryData}
          total={natureTotal}
          accent={categoryAccent ?? "#6b6a66"}
          rangeStart={categoryRangeStart}
          rangeEnd={categoryRangeEnd}
        />
      )}
      {activeTab === "accountType" && accountTypeData && (
        <AccountTypeBars data={accountTypeData} total={accountTypeTotal ?? 0} />
      )}
    </div>
  );
}
