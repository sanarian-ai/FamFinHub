import Link from "next/link";
import clsx from "clsx";
import type { PeriodDef } from "@/lib/portfolio/views";

export type Q = { p?: string; cur?: string; br?: string; div?: string };

export function parseQ(params: { [k: string]: string | string[] | undefined }): Required<Pick<Q, "cur" | "br" | "div">> & { p?: string } {
  const s = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const cur = s("cur") === "INR" ? "INR" : "USD";
  const br = s("br") === "INDmoney" || s("br") === "IBKR" ? (s("br") as string) : "ALL";
  return { p: s("p"), cur, br, div: s("div") === "1" ? "1" : "0" };
}

export function href(base: string, q: Q, patch: Q): string {
  const m = { ...q, ...patch };
  const sp = new URLSearchParams();
  if (m.p && m.p !== "SI") sp.set("p", m.p);
  if (m.cur && m.cur !== "USD") sp.set("cur", m.cur);
  if (m.br && m.br !== "ALL") sp.set("br", m.br);
  if (m.div === "1") sp.set("div", "1");
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

export function Toggles({ base, q, showBroker = false, showDividends = false }: { base: string; q: Q; showBroker?: boolean; showDividends?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Pills>
        {["USD", "INR"].map((c) => (
          <Pill key={c} to={href(base, q, { cur: c })} active={(q.cur ?? "USD") === c}>
            {c}
          </Pill>
        ))}
      </Pills>
      {showBroker && (
        <Pills>
          {[["ALL", "Both brokers"], ["INDmoney", "INDmoney"], ["IBKR", "IBKR"]].map(([k, l]) => (
            <Pill key={k} to={href(base, q, { br: k })} active={(q.br ?? "ALL") === k}>
              {l}
            </Pill>
          ))}
        </Pills>
      )}
      {showDividends && (
        <Pills>
          <Pill to={href(base, q, { div: q.div === "1" ? "0" : "1" })} active={q.div === "1"}>
            Est. dividends (25% WHT)
          </Pill>
        </Pills>
      )}
    </div>
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
