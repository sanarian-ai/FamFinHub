"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { href: "/portfolio/all", label: "Overview" },
  { href: "/portfolio/all/performance", label: "Performance" },
];

/** /portfolio/all's own 2-tab subnav (Overview = value-only composition across every tracked asset
 * class; Performance = combined India+US IRR) — same pattern as the India rollup's RollupSubNav
 * (rendered directly by each page, not via layout.tsx, so it doesn't nest under any other channel's
 * own subnav). */
export function AllSubNav() {
  const path = usePathname();
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active ? "border-slate-900 text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
