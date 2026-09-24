import type { ReactNode } from "react";
import { SubNav } from "./SubNav";

// The page header + PortfolioSwitcher come from ../layout.tsx (india/layout.tsx), inherited
// automatically since this is a nested route under /portfolio/india — no need to repeat it here.
// This layout just adds the Equity screen's own 4-tab subnav, same pattern as us/layout.tsx.
export default function IndiaEquityLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <SubNav />
      <div className="pt-5">{children}</div>
    </div>
  );
}
