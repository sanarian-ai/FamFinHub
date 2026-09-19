"use client";

import { useState } from "react";
import clsx from "clsx";
import { NatureDonut } from "./NatureDonut";
import { AccountTypeBars } from "./AccountTypeBars";
import type { NatureTotal, AccountTypeTotal } from "./aggregate";

export function BreakdownCard({
  natureData,
  natureTotal,
  accountTypeData,
  accountTypeTotal,
  periodLabel,
}: {
  natureData: NatureTotal[];
  natureTotal: number;
  accountTypeData: AccountTypeTotal[];
  accountTypeTotal: number;
  periodLabel: string;
}) {
  const [tab, setTab] = useState<"nature" | "accountType">("nature");
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900">
          {tab === "nature" ? "Spend by nature" : "By account type"} — {periodLabel}
        </h2>
        <div className="inline-flex rounded-md border border-slate-200 bg-slate-50 p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTab("nature")}
            className={clsx("rounded px-2 py-1 font-medium transition-colors", tab === "nature" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
          >
            By Nature
          </button>
          <button
            type="button"
            onClick={() => setTab("accountType")}
            className={clsx("rounded px-2 py-1 font-medium transition-colors", tab === "accountType" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500")}
          >
            By Account Type
          </button>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-400">
        {tab === "nature" ? "Click a category to view it in the Ledger." : "Expenditure / Investment / Income, this period."}
      </p>
      {tab === "nature" ? (
        <NatureDonut data={natureData} total={natureTotal} />
      ) : (
        <AccountTypeBars data={accountTypeData} total={accountTypeTotal} />
      )}
    </div>
  );
}
