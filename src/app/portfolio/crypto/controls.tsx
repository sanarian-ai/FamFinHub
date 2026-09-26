import Link from "next/link";
import clsx from "clsx";
import type { PeriodDef } from "@/lib/portfolio/views";

// No currency toggle (CoinDCX is INR-settled) and no holder toggle (single account) — just the
// period bar, mirrors india/equity/controls.tsx's Q/parseQ/href/Pills shape, trimmed down.
export type Q = { p?: string };

export function parseQ(params: { [k: string]: string | string[] | undefined }): { p?: string } {
  const s = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  return { p: s("p") };
}

export function href(base: string, q: Q, patch: Q): string {
  const m = { ...q, ...patch };
  const sp = new URLSearchParams();
  if (m.p && m.p !== "SI") sp.set("p", m.p);
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}

function Pills({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">{children}</div>;
}
function Pill({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={to} className={clsx("rounded-md px-2.5 py-1 text-sm font-medium transition-colors", active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>
      {children}
    </Link>
  );
}

export function PeriodBar({ base, q, defs, current }: { base: string; q: Q; defs: PeriodDef[]; current: string }) {
  const g = (k: PeriodDef["group"]) => defs.filter((d) => d.group === k);
  const group = (title: string, list: PeriodDef[]) =>
    list.length > 0 && (
      <div className="flex items-center gap-2">
        <span className="w-16 text-xs font-medium uppercase tracking-wide text-slate-400">{title}</span>
        <Pills>
          {list.map((d) => (
            <Pill key={d.key} to={href(base, q, { p: d.key })} active={d.key === current}>
              {d.label}
            </Pill>
          ))}
        </Pills>
      </div>
    );
  return (
    <div className="flex flex-col gap-2">
      {group("Rolling", g("rolling"))}
      {group("Calendar", g("cy"))}
      {group("Fiscal", g("fy"))}
    </div>
  );
}
