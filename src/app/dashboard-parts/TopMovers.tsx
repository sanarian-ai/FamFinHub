import { formatINR } from "@/lib/format";
import { Badge, EmptyState } from "@/components/ui";
import type { MoverRow } from "./aggregate";

export function TopMovers({ movers }: { movers: MoverRow[] }) {
  if (movers.length === 0) {
    return <EmptyState>Not enough data yet to compare month over month.</EmptyState>;
  }
  return (
    <ul className="divide-y divide-slate-100">
      {movers.map((m) => {
        const up = m.delta > 0;
        return (
          <li key={m.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-slate-800">{m.name}</div>
              <div className="text-xs text-slate-400">
                {formatINR(m.previous)} → {formatINR(m.current)}
              </div>
            </div>
            <Badge tone={up ? "rose" : "emerald"}>
              {up ? "▲" : "▼"} {formatINR(Math.abs(m.delta))}
              {m.pct != null && <span className="ml-1 opacity-80">({up ? "+" : ""}{m.pct.toFixed(0)}%)</span>}
              {m.pct == null && <span className="ml-1 opacity-80">(new)</span>}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}
