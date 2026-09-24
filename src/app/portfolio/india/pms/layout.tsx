import type { ReactNode } from "react";
import { SubNav } from "./SubNav";

// Page header + PortfolioSwitcher come from ../layout.tsx (india/layout.tsx) — same nested-route
// pattern as india/equity/layout.tsx. This just adds the PMS channel's own 4-tab subnav.
export default function IndiaPmsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <SubNav />
      <div className="pt-5">{children}</div>
    </div>
  );
}
