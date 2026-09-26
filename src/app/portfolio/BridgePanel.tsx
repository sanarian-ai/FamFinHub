"use client";

import { useState } from "react";
import { fmtDay, fmtMoney, fmtPct, tone, type Cur } from "@/lib/portfolio/format";
import type { Bridge } from "@/lib/portfolio/bridge";

/** Collapsed-by-default "why trust this number?" panel for a performance page. The reconciliation
 * (`bridge`) is computed server-side by the page itself, from data the page already fetched to render
 * everything else on it — this component only toggles visibility, it never fetches.
 *
 * Previously this component lazily called a dedicated `/api/.../bridge` route on first expand, so a
 * normal page load "paid nothing" for it. That route, though, re-ran the page's ENTIRE underlying data
 * load a second time (getPortfolioData/getIndiaPortfolioData/getCryptoPortfolioData + the run/combinedRun
 * call) purely to recompute a handful of numbers that were already sitting in memory from the page's own
 * render. bridgeFromRun/bridgeFromCombined are pure functions over that already-computed RunResult /
 * CombinedRunResult, so there was never a need to refetch anything — doing so just doubled DB load on
 * every click, which was a real contributor to Supabase's session-pool exhaustion (EMAXCONNSESSION,
 * 2026-09-26). Switched to a prop on 2026-09-26; the 6 `/bridge` API routes were removed at the same
 * time. See lib/portfolio/bridge.ts for what the numbers mean and why they're split the way they are. */
export function BridgePanel({ bridge, cur = "INR" }: { bridge: Bridge; cur?: Cur }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-slate-500 underline decoration-slate-300 underline-offset-2 hover:text-slate-700"
      >
        {open ? "Hide the math ▲" : "Why trust this number? ▼"}
      </button>
      {open && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <BridgeBody b={bridge} cur={cur} />
        </div>
      )}
    </div>
  );
}

function BridgeBody({ b, cur }: { b: Bridge; cur: Cur }) {
  // The value bridge and the return components always tie out exactly by construction (priceGain
  // and dividends are both solved as plugs — see lib/portfolio/bridge.ts). checkDiff instead compares
  // the derived dividend figure against the page's own separately-computed dividend total, which for
  // an INR view can differ slightly due to a known FX-timing approximation in that other field — only
  // flagged here if it's large enough to suggest something beyond that.
  const tol = Math.max(100, Math.abs(b.dividends) * 0.1, Math.abs(b.endValue) * 1e-4);
  const mismatch = b.checkDiff > tol;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Value bridge · {fmtDay(b.d0)} → {fmtDay(b.d1)}
        </div>
        <table className="w-full">
          <tbody>
            <tr>
              <td className="py-1 text-slate-600">Starting value</td>
              <td className="py-1 text-right tabular-nums text-slate-900">{fmtMoney(b.startValue, cur)}</td>
            </tr>
            <tr>
              <td className="py-1 text-slate-600">+ Capital added</td>
              <td className="py-1 text-right tabular-nums text-emerald-700">{fmtMoney(b.added, cur)}</td>
            </tr>
            <tr>
              <td className="py-1 text-slate-600">− Capital withdrawn</td>
              <td className="py-1 text-right tabular-nums text-rose-600">{fmtMoney(-b.withdrawn, cur)}</td>
            </tr>
            <tr>
              <td className="py-1 text-slate-600">+ Price gain/loss</td>
              <td className={`py-1 text-right tabular-nums ${tone(b.priceGain)}`}>{fmtMoney(b.priceGain, cur)}</td>
            </tr>
            <tr className="border-t border-slate-300">
              <td className="py-1 font-semibold text-slate-900">= Ending value</td>
              <td className="py-1 text-right font-semibold tabular-nums text-slate-900">{fmtMoney(b.endValue, cur)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div>
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Return components (feeds the rates below)</div>
        <table className="w-full">
          <tbody>
            <tr>
              <td className="py-1 text-slate-600">Price gain/loss</td>
              <td className="py-1 text-right tabular-nums text-slate-900">{fmtMoney(b.priceGain, cur)}</td>
            </tr>
            <tr>
              <td className="py-1 text-slate-600">+ Dividends received</td>
              <td className="py-1 text-right tabular-nums text-slate-900">{fmtMoney(b.dividends, cur)}</td>
            </tr>
            <tr className="border-t border-slate-300">
              <td className="py-1 font-semibold text-slate-900">= Total gain</td>
              <td className="py-1 text-right font-semibold tabular-nums text-slate-900">{fmtMoney(b.totalGain, cur)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-4 border-t border-slate-200 pt-2 text-xs text-slate-500">
        <span>
          Modified-Dietz: <strong className="text-slate-800">{b.ret == null ? "n/a" : fmtPct(b.ret)}</strong>
        </span>
        <span>
          XIRR: <strong className="text-slate-800">{b.irr == null ? "n/a" : fmtPct(b.irr)}</strong>
        </span>
        {!b.annualised && <span className="text-amber-600">Period return shown on the page — under 90 days for an annualised rate.</span>}
      </div>

      <div className="text-xs text-slate-400">
        Two independently-computed rates (money-weighted XIRR, time-weighted Modified-Dietz) over the same cash flows — close agreement is
        corroborating, not proof; a wide gap would be worth a closer look.
      </div>
      {mismatch && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700">
          Dividends here differ notably from the dividend figure shown elsewhere on this page — worth checking, though a small gap is expected
          from a known FX-timing rounding difference between the two.
        </div>
      )}
    </div>
  );
}
