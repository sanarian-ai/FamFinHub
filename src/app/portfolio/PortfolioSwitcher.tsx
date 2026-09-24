import Link from "next/link";

const TABS = [
  { key: "us", label: "US Stocks", href: "/portfolio/us" },
  { key: "india", label: "India equity", href: "/portfolio/india" },
  { key: "mf", label: "Mutual funds", href: "/portfolio/mf" },
  { key: "all", label: "All", href: null },
] as const;

/** The 4-tab switcher shown at the top of every /portfolio/* section — one shared copy so a new
 * section (like this one, "Mutual funds") lights up everywhere at once instead of three edits. */
export function PortfolioSwitcher({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 text-sm shadow-sm">
      {TABS.map((t) =>
        t.key === active ? (
          <span key={t.key} className="rounded-md bg-slate-900 px-3 py-1.5 font-medium text-white">
            {t.label}
          </span>
        ) : t.href ? (
          <Link key={t.key} href={t.href} className="rounded-md px-3 py-1.5 font-medium text-slate-500 hover:text-slate-800">
            {t.label}
          </Link>
        ) : (
          <span key={t.key} title="Coming later" className="cursor-not-allowed rounded-md px-3 py-1.5 font-medium text-slate-300">
            {t.label}
          </span>
        )
      )}
    </div>
  );
}
