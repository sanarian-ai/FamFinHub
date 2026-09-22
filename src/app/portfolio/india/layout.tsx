import type { ReactNode } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

export default function IndiaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Portfolio"
        subtitle="India equity · Ria · Kabir Capital PMS (Nuvama demat)"
        actions={
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm">
            <Link href="/portfolio/us" className="rounded-md px-3 py-1.5 font-medium text-slate-500 hover:text-slate-800">
              US Stocks
            </Link>
            <span className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white">India equity</span>
            {["Mutual funds", "All"].map((t) => (
              <span key={t} title="Coming later" className="cursor-not-allowed rounded-md px-3 py-1.5 font-medium text-slate-300">
                {t}
              </span>
            ))}
          </div>
        }
      />
      <div className="pt-5">{children}</div>
    </div>
  );
}
