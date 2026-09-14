function buildHref(baseParams: URLSearchParams, page: number) {
  const params = new URLSearchParams(baseParams);
  params.set("page", String(page));
  return `/ledger?${params.toString()}`;
}

export default function Pager({
  page,
  totalPages,
  totalCount,
  pageSize,
  baseParams,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  baseParams: URLSearchParams;
}) {
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
      <div>
        Showing <span className="font-medium text-slate-800">{start}</span>–
        <span className="font-medium text-slate-800">{end}</span> of{" "}
        <span className="font-medium text-slate-800">{totalCount.toLocaleString("en-IN")}</span> transactions
      </div>
      <div className="flex items-center gap-2">
        <PagerLink href={buildHref(baseParams, page - 1)} disabled={page <= 1}>
          ← Prev
        </PagerLink>
        <span className="px-2 text-xs text-slate-500">
          Page {page} of {totalPages}
        </span>
        <PagerLink href={buildHref(baseParams, page + 1)} disabled={page >= totalPages}>
          Next →
        </PagerLink>
      </div>
    </div>
  );
}

function PagerLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="cursor-not-allowed rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-300">
        {children}
      </span>
    );
  }
  return (
    <a href={href} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
      {children}
    </a>
  );
}
