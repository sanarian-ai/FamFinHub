import type { ReactNode } from "react";
import clsx from "clsx";
import { Badge, Card } from "@/components/ui";
import type { Health } from "@/lib/portfolio/data";
import { fmtDay } from "@/lib/portfolio/format";

export function Tile({ label, value, sub, valueClass, dot }: { label: string; value: string; sub?: ReactNode; valueClass?: string; dot?: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
        {dot && <span className="inline-block h-2 w-2 rounded-full" style={{ background: dot }} />}
        {label}
      </div>
      <div className={clsx("mt-1 text-2xl font-semibold tabular-nums text-slate-900", valueClass)}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
}

export const Th = ({ children, right = true, className }: { children?: ReactNode; right?: boolean; className?: string }) => (
  <th className={clsx("px-3 py-2 text-xs font-medium uppercase tracking-wide text-slate-500", right ? "text-right" : "text-left", className)}>{children}</th>
);
export const Td = ({ children, right = true, className, title }: { children?: ReactNode; right?: boolean; className?: string; title?: string }) => (
  <td title={title} className={clsx("px-3 py-2 tabular-nums", right ? "text-right" : "text-left", className)}>{children}</td>
);
export const tableCls = "w-full text-sm";
export const theadCls = "border-b border-slate-200";
export const rowCls = "border-b border-slate-100 last:border-0";

export function HealthStrip({ h }: { h: Health }) {
  const total = h.recon.length;
  const allOk = total > 0 && h.reconOk === total;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <Badge tone={allOk ? "emerald" : total === 0 ? "slate" : "rose"}>
        {total === 0 ? "No broker snapshots yet" : `Units reconcile ${h.reconOk}/${total}`}
      </Badge>
      <Badge tone={h.stalePrices ? "amber" : "slate"}>Prices to {fmtDay(h.pricesAsOf)}</Badge>
      <Badge tone={h.staleSnapshot ? "amber" : "slate"}>{h.positionsAsOf ? `Broker positions as of ${fmtDay(h.positionsAsOf)}` : "No broker positions"}</Badge>
      {h.openReviews > 0 && <Badge tone="amber">{h.openReviews} open review item{h.openReviews === 1 ? "" : "s"}</Badge>}
    </div>
  );
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-slate-500">{children}</p>;
}
