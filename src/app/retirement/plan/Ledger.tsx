import Link from "next/link";
import clsx from "clsx";
import { Badge, Card } from "@/components/ui";
import type { Row } from "@/lib/retirement";

const fmtL = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** basePath lets this be reused from any route (currently /retirement/stress) without hard-coding it. */
function UnitToggle({ unit, basePath }: { unit: "real" | "nominal"; basePath: string }) {
  const opts: { key: "real" | "nominal"; label: string; href: string }[] = [
    { key: "real", label: "Today's money", href: basePath },
    { key: "nominal", label: "Nominal", href: `${basePath}?unit=nominal` },
  ];
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
      {opts.map((o) => (
        <Link
          key={o.key}
          href={o.href}
          className={clsx(
            "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
            unit === o.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100",
          )}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

/** Year-by-year ledger table — moved here unchanged from the old /retirement/plan page (M4) so
 *  /retirement/stress can render it without duplicating the markup. */
export function Ledger({
  rows, depletionYear, unit, basePath,
}: {
  rows: Row[]; depletionYear: number | null; unit: "real" | "nominal"; basePath: string;
}) {
  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Year-by-year ledger</h2>
          <span className="text-xs text-slate-500">2026 is a Q4 stub (valuation 1 Oct 2026).</span>
        </div>
        <UnitToggle unit={unit} basePath={basePath} />
      </div>
      <div className="max-h-[520px] overflow-y-auto overflow-x-auto rounded-lg border border-slate-100">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2 pl-3 pr-3 font-medium">Year</th>
              <th className="py-2 pr-3 text-right font-medium">Income</th>
              <th className="py-2 pr-3 text-right font-medium">Expense</th>
              <th className="py-2 pr-3 text-right font-medium">Net</th>
              <th className="py-2 pr-3 text-right font-medium">Assets/inflows</th>
              <th className="py-2 pr-3 text-right font-medium">Portfolio</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.Y} className={clsx("border-b border-slate-50", r.port < 0 && "bg-rose-50")}>
                <td className="py-1.5 pl-3 pr-3 text-slate-700">
                  {r.Y}
                  {depletionYear === r.Y && (
                    <span className="ml-1.5">
                      <Badge tone="rose">depletes</Badge>
                    </span>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{fmtL(r.inc)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{fmtL(r.exp)}</td>
                <td className={clsx("py-1.5 pr-3 text-right tabular-nums", r.net < 0 ? "text-rose-600" : "text-slate-600")}>
                  {fmtL(r.net)}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{fmtL(r.assets)}</td>
                <td
                  className={clsx(
                    "py-1.5 pr-3 text-right tabular-nums font-medium",
                    r.port < 0 ? "text-rose-600" : "text-slate-800",
                  )}
                >
                  {fmtL(r.port)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
