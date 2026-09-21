import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { SubNav } from "./SubNav";

export default function UsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Portfolio"
        subtitle="US stocks · Sangeeth · INDmoney (Alpaca) + Interactive Brokers"
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm">
            <span className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white">US Stocks</span>
            {["India equity", "Mutual funds", "All"].map((t) => (
              <span key={t} title="Coming later" className="cursor-not-allowed rounded-md px-3 py-1.5 font-medium text-slate-300">
                {t}
              </span>
            ))}
          </div>
        }
      />
      <SubNav />
      <div className="pt-5">{children}</div>
    </div>
  );
}
