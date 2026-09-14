import Link from "next/link";
import clsx from "clsx";

const TABS = [
  { href: "/mapping", label: "Tree" },
  { href: "/mapping/rules", label: "Rules" },
  { href: "/mapping/accounts", label: "Accounts" },
] as const;

export default function MappingTabs({ active }: { active: "tree" | "rules" | "accounts" }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-slate-200">
      {TABS.map((t) => {
        const key = t.href === "/mapping" ? "tree" : t.href.split("/").pop();
        const isActive = key === active;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={clsx(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium",
              isActive
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-500 hover:text-slate-700"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
