"use client";

import { useState, useTransition } from "react";
import { restoreDismissalAction } from "./actions";

/** Undo button for one row in the "Discarded forever" list — brings its matching transactions
 * back into the active Review Queue on the next load. */
export function RestoreDismissalButton({ id }: { id: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-rose-600">{error}</span>}
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            try {
              await restoreDismissalAction(id);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Couldn't restore — try again.");
            }
          })
        }
        className="shrink-0 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
      >
        {isPending ? "Restoring…" : "Restore"}
      </button>
    </div>
  );
}
