"use client";

import { useState, useTransition } from "react";
import { addNetWorthItemAction } from "./actions";

export function AddNetWorthBucket({ planId }: { planId: string }) {
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function add() {
    const v = parseFloat(value);
    if (!label.trim()) { setErr("Enter a name for the asset bucket."); return; }
    if (!Number.isFinite(v) || v < 0) { setErr("Starting value (₹L) must be a non-negative number."); return; }
    setErr(null);
    startTransition(async () => {
      try {
        await addNetWorthItemAction(planId, label.trim(), v);
        setLabel(""); setValue("");
      } catch (e) {
        setErr((e as Error).message);
      }
    });
  }

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
      <label className="flex flex-1 min-w-[160px] flex-col gap-1 text-xs font-medium text-slate-500">
        New asset bucket name
        <input
          type="text" value={label} disabled={pending}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. NPS Tier 2"
          className="rounded-md border border-slate-200 px-2 py-1 text-sm disabled:opacity-50"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Starting value (₹L)
        <input
          type="number" step="0.01" min="0" value={value} disabled={pending}
          onChange={(e) => setValue(e.target.value)}
          className="w-32 rounded-md border border-slate-200 px-2 py-1 text-sm tabular-nums disabled:opacity-50"
        />
      </label>
      <button
        onClick={add} disabled={pending}
        className="rounded-md border border-slate-200 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        Add asset bucket
      </button>
      {err && <div className="w-full text-xs text-rose-600">{err}</div>}
    </div>
  );
}
