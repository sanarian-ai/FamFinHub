import Link from "next/link";

const TABS = [
  { key: "all", label: "All assets", href: "/portfolio/all" },
  { key: "us", label: "US Stocks", href: "/portfolio/us" },
  { key: "india", label: "India equity", href: "/portfolio/india" },
  { key: "mf", label: "Mutual funds", href: "/portfolio/mf" },
] as const;

/** The 4-tab switcher shown at the top of every /portfolio/* section — one shared copy so a new
 * section lights up everywhere at once instead of four edits. "All assets" is the landing tab
 * (see portfolio/page.tsx's redirect) — it fronts the cross-asset view built on
 * src/lib/portfolio/networth.ts, the rest are each account's own detail page. */
export function PortfolioSwitcher({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm">
      {TABS.map((t) =>
        t.key === active ? (
          <span key={t.key} className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white">
            {t.label}
          </span>
        ) : (
          <Link key={t.key} href={t.href} className="rounded-md px-3 py-1.5 font-medium text-slate-500 hover:text-slate-800">
            {t.label}
          </Link>
        )
      )}
    </div>
  );
}
