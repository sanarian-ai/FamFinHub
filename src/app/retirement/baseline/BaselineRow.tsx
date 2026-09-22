"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { markReviewedAction, saveBaselineValueAction, useLedgerValueAction } from "./actions";

const fmtL = (v: number) => v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 });

export type RowUnit = "monthly" | "annual" | "lump";

export function BaselineRow({
  planId, itemKey, label, valueL, unit, lastReviewedAt,
  ledgerComparableL, ledgerN, driftThresholdPct,
}: {
  planId: string; itemKey: string; label: string; valueL: number; unit: RowUnit; lastReviewedAt: string;
  ledgerComparableL: number | null; ledgerN: number; driftThresholdPct: number;
}) {
  const [value, setValue] = useState(String(valueL));
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const variancePct = ledgerComparableL != null && valueL > 0 ? ((ledgerComparableL - valueL) / valueL) * 100 : null;
  const drifted = variancePct != null && Math.abs(variancePct) >= driftThresholdPct;

  function save() {
    const v = parseFloat(value);
    if (!Number.isFinite(v) || v < 0) { setErr("Enter a non-negative number."); return; }
    setErr(null);
    startTransition(async () => {
      try { await saveBaselineValueAction(planId, itemKey, v); } catch (e) { setErr((e as Error).message); }
    });
  }
  function keep() {
    startTransition(async () => {
      try { await markReviewedAction(planId, itemKey); } catch (e) { setErr((e as Error).message); }
    });
  }
  function useLedger() {
    startTransition(async () => {
      try { await useLedgerValueAction(planId, itemKey, unit); } catch (e) { setErr((e as Error).message); }
    });
  }

  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="py-2.5 pr-3 text-slate-800">{label}</td>
      <td className="py-2.5 pr-3">
        <div className="flex items-center gap-1.5">
          <input
            type="number" step="0.0001" min="0" value={value} disabled={pending}
            onChange={(e) => setValue(e.target.value)}
            className="w-24 rounded-md border border-slate-200 px-2 py-1 text-right text-sm tabular-nums disabled:opacity-50"
          />
          <button onClick={save} disabled={pending} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Save
          </button>
        </div>
        {err && <div className="mt-1 text-xs text-rose-600">{err}</div>}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-500">
        {ledgerComparableL == null ? <span className="text-slate-300">—</span> : fmtL(ledgerComparableL)}
        {ledgerComparableL != null && <div className="text-[11px] text-slate-400">{ledgerN} txns, LTM</div>}
      </td>
      <td className="py-2.5 pr-3 text-right">
        {variancePct == null ? (
          <span className="text-slate-300">—</span>
        ) : (
          <Badge tone={drifted ? "amber" : "slate"}>
            {variancePct > 0 ? "+" : ""}{variancePct.toFixed(0)}%
          </Badge>
        )}
      </td>
      <td className="py-2.5 pr-3 text-xs text-slate-400">{lastReviewedAt}</td>
      <td className="py-2.5">
        <div className="flex justify-end gap-1.5">
          {ledgerComparableL != null && (
            <button onClick={useLedger} disabled={pending} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
              Use ledger value
            </button>
          )}
          <button onClick={keep} disabled={pending} className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            Keep my number
          </button>
        </div>
      </td>
    </tr>
  );
}
