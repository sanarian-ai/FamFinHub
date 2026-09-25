import type { ReactNode } from "react";
import { SubNav } from "./SubNav";

// Page header + PortfolioSwitcher come from ../layout.tsx (india/layout.tsx) — same nested-route
// pattern as india/equity/layout.tsx and india/pms/layout.tsx. This just adds the MF channel's own
// 4-tab subnav, replacing the single un-tabbed page this route used to be.
export default function IndiaMfLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <SubNav />
      <div className="pt-5">{children}</div>
    </div>
  );
}
