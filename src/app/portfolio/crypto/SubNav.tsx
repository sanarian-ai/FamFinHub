"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

const tabs = [
  { href: "/portfolio/crypto", label: "Overview" },
  { href: "/portfolio/crypto/performance", label: "Performance" },
  { href: "/portfolio/crypto/holdings", label: "Holdings & lots" },
  { href: "/portfolio/crypto/activity", label: "Activity" },
];

export function SubNav() {
  const path = usePathname();
  return (
    <div className="flex gap-1 border-b border-slate-200">
      {tabs.map((t) => {
        const active = t.href === "/portfolio/crypto" ? path === t.href : path.startsWith(t.href);
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
