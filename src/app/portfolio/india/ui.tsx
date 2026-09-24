import type { ReactNode } from "react";
import clsx from "clsx";
import { Card } from "@/components/ui";

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

export function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-slate-500">{children}</p>;
}
