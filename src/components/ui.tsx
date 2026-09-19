import { ReactNode } from "react";
import clsx from "clsx";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx("rounded-xl border border-slate-200 bg-white p-5 shadow-sm", className)}>
      {children}
    </div>
  );
}

function deltaLine(delta: number | null | undefined, deltaLabel: string | undefined, positiveIsBad: boolean) {
  if (delta == null) return null;
  const color = delta > 0 ? (positiveIsBad ? "text-rose-600" : "text-emerald-600") : "text-emerald-600";
  return (
    <div className={clsx("mt-1 text-xs font-medium", color)}>
      {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}% {deltaLabel}
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  delta2,
  deltaLabel2,
  positiveIsBad = true,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  /** A second comparator line — e.g. vs. the same period last year, alongside vs. last period. */
  delta2?: number | null;
  deltaLabel2?: string;
  /** Whether a positive delta should read as bad (red) — true for spend/expense tiles, false for income/net. */
  positiveIsBad?: boolean;
}) {
  return (
    <Card>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
      {deltaLine(delta, deltaLabel, positiveIsBad)}
      {deltaLine(delta2, deltaLabel2, positiveIsBad)}
    </Card>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: "slate" | "amber" | "emerald" | "rose" | "blue" }) {
  const tones: Record<string, string> = {
    slate: "bg-slate-100 text-slate-700",
    amber: "bg-amber-100 text-amber-800",
    emerald: "bg-emerald-100 text-emerald-800",
    rose: "bg-rose-100 text-rose-700",
    blue: "bg-blue-100 text-blue-700",
  };
  return <span className={clsx("rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">{children}</div>;
}
