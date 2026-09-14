import { formatINR } from "@/lib/format";
import type { AccountTotal } from "./aggregate";
import { EmptyState } from "@/components/ui";

const BAR_COLOR = "#2a78d6"; // sequential blue — one measure (spend), one hue

export function AccountSplit({ accounts }: { accounts: AccountTotal[] }) {
  if (accounts.length === 0) {
    return <EmptyState>No spend recorded on any account this period.</EmptyState>;
  }
  const max = Math.max(...accounts.map((a) => a.total));
  return (
    <ul className="space-y-3">
      {accounts.map((a) => (
        <li key={a.id}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate font-medium text-slate-700">
              {a.name}
              <span className="ml-1.5 text-xs font-normal text-slate-400">{a.holder}</span>
            </span>
            <span className="shrink-0 font-semibold text-slate-900">{formatINR(a.total)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${max > 0 ? (a.total / max) * 100 : 0}%`, background: BAR_COLOR }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
