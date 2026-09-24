import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { PortfolioSwitcher } from "../PortfolioSwitcher";

export default function IndiaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Portfolio"
        subtitle="Blended across direct equity, PMS and mutual funds — see the Equity and Mutual Funds channel pages for per-channel detail"
        actions={<PortfolioSwitcher active="india" />}
      />
      <div className="pt-5">{children}</div>
    </div>
  );
}
