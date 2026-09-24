import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { PortfolioSwitcher } from "../PortfolioSwitcher";

export default function IndiaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Portfolio"
        subtitle="India equity · Kabir PMS + IIFL demat (Ria) · NSE (Sangeeth via Zerodha, Ria via Kotak Securities)"
        actions={<PortfolioSwitcher active="india" />}
      />
      <div className="pt-5">{children}</div>
    </div>
  );
}
