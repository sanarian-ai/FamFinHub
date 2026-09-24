"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type RefreshResult = {
  updated: { symbol: string; date: string; close: number }[];
  fallback: string[];
  count: { requested: number; updated: number; fallback: number };
  error?: string;
};

/**
 * Calls POST /api/portfolio/mf/prices/refresh (AMFI's daily NAV file) and shows a per-symbol
 * summary — the mutual fund counterpart to india/RefreshButton.tsx. A symbol AMFI has no NAV for
 * isn't an error: its existing last-known price is simply left as-is.
 */
export function RefreshButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RefreshResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setErr(null);
    setResult(null);
    try {
      const res = await fetch("/api/portfolio/mf/prices/refresh", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setErr(body?.error ?? `Request failed (${res.status})`);
      } else {
        setResult(body);
        router.refresh();
      }
    } catch {
      setErr("Network error — could not reach the refresh endpoint.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        onClick={onClick}
        disabled={busy}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
      >
        {busy ? "Refreshing…" : "Refresh NAVs"}
      </button>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      {result && !err && (
        <div className="text-xs text-slate-500">
          {result.count.updated} updated
          {result.count.fallback > 0 && <>, {result.count.fallback} kept last known NAV</>}
          {result.fallback.length > 0 && <span title={result.fallback.join(", ")}> (hover for symbols)</span>}
        </div>
      )}
    </div>
  );
}
