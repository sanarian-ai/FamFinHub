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
 * Calls POST /api/portfolio/prices/refresh?scope=crypto (CoinGecko's /simple/price, no historical
 * limit — see cryptoPriceFeed.ts). Same daily scheduled task that refreshes Kabir/US prices
 * (scope=all) also covers crypto now, so this button is a demand-based top-up on top of that daily
 * run, not the only way prices get refreshed. Mirrors india/RefreshButton.tsx's UI/behavior exactly.
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
      const res = await fetch("/api/portfolio/prices/refresh?scope=crypto", { method: "POST" });
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
        {busy ? "Refreshing…" : "Refresh prices"}
      </button>
      {err && <div className="text-xs text-rose-600">{err}</div>}
      {result && !err && (
        <div className="text-xs text-slate-500">
          {result.count.updated} updated
          {result.count.fallback > 0 && <>, {result.count.fallback} kept last known price</>}
          {result.fallback.length > 0 && <span title={result.fallback.join(", ")}> (hover for symbols)</span>}
        </div>
      )}
    </div>
  );
}
