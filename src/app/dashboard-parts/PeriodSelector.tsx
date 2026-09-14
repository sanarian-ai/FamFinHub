import Link from "next/link";
import clsx from "clsx";
import type { PeriodKind, YearView } from "./period";

function hrefFor(kind: PeriodKind, view: YearView) {
  const params = new URLSearchParams({ period: kind });
  if (kind === "year") params.set("view", view);
  return `/?${params.toString()}`;
}

export function PeriodSelector({ kind, view }: { kind: PeriodKind; view: YearView }) {
  const options: { label: string; kind: PeriodKind; view: YearView }[] = [
    { label: "This Month", kind: "month", view: "cal" },
    { label: "Calendar Year", kind: "year", view: "cal" },
    { label: "Fiscal Year (Apr–Mar)", kind: "year", view: "fy" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((o) => {
        const active = o.kind === kind && (o.kind === "month" || o.view === view);
        return (
          <Link
            key={o.label}
            href={hrefFor(o.kind, o.view)}
            className={clsx(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
            )}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
