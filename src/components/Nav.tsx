import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import SignOutButton from "./SignOutButton";

const links = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/ledger", label: "Ledger", icon: "📒" },
  { href: "/review", label: "Review Queue", icon: "🔎", badge: true },
  { href: "/insights", label: "Insights & Trends", icon: "📈" },
  { href: "/mapping", label: "Mapping Admin", icon: "🗂️" },
];

export default async function Nav() {
  const [needsReviewCount, session] = await Promise.all([
    prisma.transaction.count({ where: { status: "needs_review" } }),
    getServerSession(authOptions),
  ]);

  return (
    <nav className="w-60 shrink-0 border-r border-slate-200 bg-white p-4 flex flex-col gap-1">
      <div className="px-2 pb-4">
        <div className="text-sm font-semibold text-slate-900">Family Finance Hub</div>
        <div className="text-xs text-slate-500">Sangeeth &amp; Ria</div>
      </div>
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden>{l.icon}</span>
            {l.label}
          </span>
          {l.badge && needsReviewCount > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              {needsReviewCount}
            </span>
          )}
        </Link>
      ))}
      {session?.user?.email && (
        <div className="mt-auto flex flex-col gap-1 border-t border-slate-100 px-2 pt-3">
          <div className="truncate text-xs text-slate-500" title={session.user.email}>
            {session.user.email}
          </div>
          <SignOutButton />
        </div>
      )}
    </nav>
  );
}
