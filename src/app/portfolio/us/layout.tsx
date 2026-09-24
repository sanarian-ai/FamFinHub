import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { PortfolioSwitcher } from "../PortfolioSwitcher";
import { SubNav } from "./SubNav";

export default function UsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Portfolio"
        subtitle="US stocks · Sangeeth · INDmoney (Alpaca) + Interactive Brokers"
        actions={<PortfolioSwitcher active="us" />}
      />
      <SubNav />
      <div className="pt-5">{children}</div>
    </div>
  );
}
