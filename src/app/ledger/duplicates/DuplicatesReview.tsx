"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { formatDate, formatINR } from "@/lib/format";
import { bulkDeleteTransactions } from "../actions";
import type { ReviewCluster } from "@/lib/dedupeReview";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  gmail_daily: "Gmail (daily)",
  gmail_monthly_reconcile: "Gmail (reconcile)",
  csv_import: "CSV import",
  migration: "Migrated",
};

const SECTIONS: { tier: ReviewCluster["tier"]; title: string; blurb: string; open: boolean }[] = [
  { tier: "likely", title: "Likely duplicates", blurb: "Same merchant, worded differently (daily alert vs statement line, or a re-read statement). The extra rows are pre-ticked; the suggested survivor is left unticked.", open: true },
  { tier: "check", title: "Needs a closer look", blurb: "Something here needs a human call — possible genuine repeats, different categories, or rows from the original spreadsheet load. Nothing pre-ticked.", open: false },
  { tier: "identical", title: "Word-for-word identical", blurb: "Same description, same day, same amount. Often genuine repeat purchases (e.g. two identical fares), so nothing is pre-ticked.", open: false },
];

export default function DuplicatesReview({ clusters }: { clusters: ReviewCluster[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  // Pre-tick only the suggested deletions of "likely" clusters.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(clusters.filter((c) => c.tier === "likely").flatMap((c) => c.deleteIds))
  );
  const [message, setMessage] = useState<string | null>(null);

  const fullyTicked = useMemo(() => clusters.filter((c) => c.rows.every((r) => selected.has(r.id))), [clusters, selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function setCluster(c: ReviewCluster, ticked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of c.deleteIds) (ticked ? next.add(id) : next.delete(id));
      return next;
    });
  }

  function handleDelete() {
    const ids = Array.from(selected);
    if (ids.length === 0 || fullyTicked.length > 0) return;
    if (!window.confirm(`Permanently delete ${ids.length} transaction${ids.length === 1 ? "" : "s"}? This can't be undone.`)) return;
    startTransition(async () => {
      const { deletedCount, skippedCount } = await bulkDeleteTransactions(ids);
      setMessage(
        `Deleted ${deletedCount}.` +
          (skippedCount > 0 ? ` Skipped ${skippedCount} — linked to a portfolio funding record, so they can't be deleted from here.` : "")
      );
      setSelected(new Set());
      router.refresh();
    });
  }

  if (clusters.length === 0) {
    return <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">No possible duplicates found.</div>;
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5">
        <span className="text-sm font-medium text-rose-900">{selected.size} selected for deletion</span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={isPending || selected.size === 0 || fullyTicked.length > 0}
          className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          Delete {selected.size} selected…
        </button>
        {fullyTicked.length > 0 && (
          <span className="text-xs font-medium text-rose-700">
            {fullyTicked.length} group{fullyTicked.length === 1 ? " has" : "s have"} every row ticked — untick at least one row per group to keep the transaction.
          </span>
        )}
        {message && <span className="text-xs font-medium text-emerald-700">{message}</span>}
      </div>

      {SECTIONS.map((sec) => {
        const items = clusters.filter((c) => c.tier === sec.tier);
        if (items.length === 0) return null;
        return (
          <details key={sec.tier} open={sec.open} className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-900">
              {sec.title} <span className="ml-1 font-normal text-slate-500">· {items.length} groups, {items.reduce((n, c) => n + c.deleteIds.length, 0)} surplus rows</span>
            </summary>
            <p className="px-4 pb-3 text-xs text-slate-500">{sec.blurb}</p>
            <div className="flex flex-col gap-3 px-4 pb-4">
              {items.map((c) => (
                <div key={c.key} className="rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
                    <span>
                      <span className="font-medium text-slate-800">{formatDate(c.date)}</span> ·{" "}
                      <span className={clsx("font-medium tabular-nums", c.amount < 0 ? "text-rose-600" : "text-emerald-600")}>{formatINR(c.amount, { signDisplay: "always" })}</span> ·{" "}
                      {c.accountName ?? "No account"}
                    </span>
                    <span className="flex items-center gap-3">
                      {c.note && <span className="text-amber-700">{c.note}</span>}
                      <button type="button" className="text-blue-700 hover:underline" onClick={() => setCluster(c, true)}>Tick suggested</button>
                      <button type="button" className="text-slate-500 hover:underline" onClick={() => setCluster(c, false)}>Untick all</button>
                    </span>
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {c.rows.map((r) => (
                        <tr key={r.id} className={clsx("border-b border-slate-100 last:border-0", selected.has(r.id) && "bg-rose-50/60")}>
                          <td className="w-8 px-3 py-1.5 align-top">
                            <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Select ${r.description}`} />
                          </td>
                          <td className="px-2 py-1.5 align-top text-slate-800">
                            <div className="break-all">{r.description}</div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 align-top">
                            <Badge tone="slate">{SOURCE_LABEL[r.source] ?? r.source}</Badge>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 align-top">
                            <Badge tone={r.status === "categorized" ? "emerald" : "amber"}>{r.categoryName ?? (r.status === "categorized" ? "Categorized" : "Needs review")}</Badge>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1.5 align-top text-slate-400">added {formatDate(r.createdAt)}</td>
                          <td className="w-16 px-2 py-1.5 align-top">{r.id === c.keepId && <Badge tone="blue">Keep</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
