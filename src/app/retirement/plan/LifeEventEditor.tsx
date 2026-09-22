"use client";

import { useState, useTransition } from "react";
import { Badge, Card } from "@/components/ui";
import { addLifeEventAction, deleteLifeEventAction } from "./actions";

export interface PlanEvent {
  id: string;
  year: number;
  label?: string;
  kind: "expense" | "inflow";
  amt: number;
  note: string | null;
}

const fmtL = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export function LifeEventEditor({ planId, events }: { planId: string; events: PlanEvent[] }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [year, setYear] = useState("");
  const [kind, setKind] = useState<"expense" | "inflow">("expense");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");

  const sorted = [...events].sort((a, b) => a.year - b.year);

  function addEvent() {
    const y = parseInt(year, 10);
    const amt = parseFloat(amount);
    if (!Number.isInteger(y) || y < 2026 || y > 2082) { setErr("Year must be 2026..2082."); return; }
    if (!Number.isFinite(amt) || amt < 0) { setErr("Amount (₹L) must be a non-negative number."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        await addLifeEventAction(planId, { year: y, kind, amount: amt, label: label.trim() });
        setYear(""); setAmount(""); setLabel("");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  function remove(id: string) {
    setErr(null);
    startTransition(async () => {
      try { await deleteLifeEventAction(planId, id); } catch (e) { setErr((e as Error).message); }
    });
  }

  return (
    <Card>
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Life events</h2>
        <span className="text-xs text-slate-500">One-off expenses or inflows in a given year, today&apos;s money. Every other custom event stays in code (see Params).</span>
      </div>

      {sorted.length === 0 ? (
        <div className="mb-4 text-sm text-slate-400">No custom life events yet.</div>
      ) : (
        <table className="mb-4 w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3 font-medium">Year</th>
              <th className="py-2 pr-3 font-medium">Kind</th>
              <th className="py-2 pr-3 text-right font-medium">Amount (₹L)</th>
              <th className="py-2 pr-3 font-medium">Label</th>
              <th className="py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => (
              <tr key={e.id} className="border-b border-slate-100">
                <td className="py-2 pr-3 text-slate-700">{e.year}</td>
                <td className="py-2 pr-3">
                  <Badge tone={e.kind === "expense" ? "rose" : "emerald"}>{e.kind}</Badge>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-600">{fmtL(e.amt)}</td>
                <td className="py-2 pr-3 text-slate-600">{e.label ?? "Event"}</td>
                <td className="py-2 text-right">
                  <button
                    onClick={() => remove(e.id)}
                    disabled={pending}
                    className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Year
          <input
            type="number" min="2026" max="2082" value={year} disabled={pending}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Kind
          <select
            value={kind} disabled={pending}
            onChange={(e) => setKind(e.target.value as "expense" | "inflow")}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm disabled:opacity-50"
          >
            <option value="expense">Expense</option>
            <option value="inflow">Inflow</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
          Amount (₹L)
          <input
            type="number" step="0.01" min="0" value={amount} disabled={pending}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums disabled:opacity-50"
          />
        </label>
        <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-xs font-medium text-slate-500">
          Label (optional)
          <input
            type="text" value={label} disabled={pending}
            onChange={(e) => setLabel(e.target.value)}
            className="rounded-md border border-slate-200 px-2 py-1 text-sm disabled:opacity-50"
          />
        </label>
        <button
          onClick={addEvent} disabled={pending}
          className="rounded-md border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          Add event
        </button>
      </div>
      {err && <div className="mt-2 text-xs text-rose-600">{err}</div>}
    </Card>
  );
}
