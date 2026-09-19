import Link from "next/link";
import clsx from "clsx";
import type { PeriodKind, YearView, PersonView } from "./period";

function hrefFor(kind: PeriodKind, view: YearView, person: PersonView) {
  const params = new URLSearchParams({ period: kind });
  if (kind === "year") params.set("view", view);
  if (person !== "household") params.set("person", person);
  return `/?${params.toString()}`;
}

export function PersonSelector({
  kind,
  view,
  person,
}: {
  kind: PeriodKind;
  view: YearView;
  person: PersonView;
}) {
  const options: { label: string; value: PersonView }[] = [
    { label: "Household", value: "household" },
    { label: "Sangeeth", value: "Sangeeth" },
    { label: "Ria", value: "Ria" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {options.map((o) => {
        const active = o.value === person;
        return (
          <Link
            key={o.value}
            href={hrefFor(kind, view, o.value)}
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
