import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { PortfolioSwitcher } from "../PortfolioSwitcher";

export default function MfLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Portfolio"
        subtitle="Mutual funds · Ria · CAMS/KFintech Consolidated Account Statement"
        actions={<PortfolioSwitcher active="mf" />}
      />
      <div className="pt-5">{children}</div>
    </div>
  );
}
