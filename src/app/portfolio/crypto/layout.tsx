import type { ReactNode } from "react";
import { PageHeader } from "@/components/ui";
import { PortfolioSwitcher } from "../PortfolioSwitcher";
import { SubNav } from "./SubNav";

export default function CryptoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Portfolio"
        subtitle="Crypto · Sangeeth · CoinDCX (BTC + ETH)"
        actions={<PortfolioSwitcher active="crypto" />}
      />
      <SubNav />
      <div className="pt-5">{children}</div>
    </div>
  );
}
