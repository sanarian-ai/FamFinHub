import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { PortfolioSwitcher } from "../PortfolioSwitcher";

export default function AllLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Portfolio"
        subtitle="All assets · US equity, Indian equity (Kabir PMS, IIFL, NSE), mutual funds, EPF + NPS"
        actions={<PortfolioSwitcher active="all" />}
      />
      <div className="pt-5">{children}</div>
    </div>
  );
}
