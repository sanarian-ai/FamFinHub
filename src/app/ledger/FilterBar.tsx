import type { CategoryOption, NatureOption } from "./types";

type Account = { id: string; name: string; holder: string; isActive: boolean };

export default function FilterBar({
  accounts,
  categories,
  natures,
  values,
}: {
  accounts: Account[];
  categories: CategoryOption[];
  natures: NatureOption[];
  values: {
    from: string;
    to: string;
    accountId: string;
    categoryId: string;
    natureId: string;
    status: string;
    q: string;
    includeHistorical: boolean;
  };
}) {
  const visibleAccounts = values.includeHistorical ? accounts : accounts.filter((a) => a.isActive);

  const groups: { label: string; items: CategoryOption[] }[] = [];
  for (const c of categories) {
    const label = `${c.natureName} › ${c.expenseTypeName}`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(c);
    else groups.push({ label, items: [c] });
  }

  // Grouped by Account Type (Expenditure/Investment/Income/Transfer) — only ~14 natures total,
  // so this is one level of grouping rather than a searchable picker like Category's (237 values).
  const natureGroups: { label: string; items: NatureOption[] }[] = [];
  for (const n of natures) {
    const last = natureGroups[natureGroups.length - 1];
    if (last && last.label === n.accountType) last.items.push(n);
    else natureGroups.push({ label: n.accountType, items: [n] });
  }

  const inputCls =
    "rounded-md border border-slate-200 px-2.5 py-1.5 text-sm text-slate-700 outline-none focus:border-slate-400 bg-white";

  return (
    <form method="GET" className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">From</label>
        <input type="date" name="from" defaultValue={values.from} className={inputCls} />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">To</label>
        <input type="date" name="to" defaultValue={values.to} className={inputCls} />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Account</label>
        <select name="accountId" defaultValue={values.accountId} className={inputCls}>
          <option value="">All accounts</option>
          {visibleAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.holder}){!a.isActive ? " — historical" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Nature</label>
        <select name="natureId" defaultValue={values.natureId} className={inputCls}>
          <option value="">All natures</option>
          {natureGroups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Category</label>
        <select name="categoryId" defaultValue={values.categoryId} className={inputCls}>
          <option value="">All categories</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Status</label>
        <select name="status" defaultValue={values.status} className={inputCls}>
          <option value="">All statuses</option>
          <option value="categorized">Categorized</option>
          <option value="needs_review">Needs review</option>
        </select>
      </div>

      <div className="flex min-w-[200px] flex-1 flex-col gap-1">
        <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Search description</label>
        <input
          type="text"
          name="q"
          defaultValue={values.q}
          placeholder="e.g. Amazon, Swiggy, Photon…"
          className={inputCls}
        />
      </div>

      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        <input type="checkbox" name="includeHistorical" value="1" defaultChecked={values.includeHistorical} />
        Include historical accounts
      </label>

      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-800">
          Apply
        </button>
        <a href="/ledger" className="rounded-md border border-slate-200 px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
          Reset
        </a>
      </div>
    </form>
  );
}
