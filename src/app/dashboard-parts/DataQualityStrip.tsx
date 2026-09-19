import Link from "next/link";
import { formatINR, formatDate } from "@/lib/format";

export function DataQualityStrip({
  needsReviewCount,
  unattributedTotal,
  lastSync,
}: {
  needsReviewCount: number;
  unattributedTotal: number;
  lastSync: Date | null;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-xs text-slate-500">
      <Link href="/review" className="hover:text-slate-700 hover:underline">
        {needsReviewCount} awaiting review (2020+)
      </Link>
      <span>{formatINR(unattributedTotal)} unattributed spend (pre-2019, no account on record)</span>
      <span>Last automated sync: {lastSync ? formatDate(lastSync) : "none yet"}</span>
    </div>
  );
}
