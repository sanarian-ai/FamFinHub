import { prisma } from "@/lib/prisma";
import { formatINR } from "@/lib/format";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import MappingTabs from "./MappingTabs";
import {
  createExpenseNature,
  updateExpenseNature,
  createExpenseType,
  updateExpenseType,
  createCategory,
  updateCategory,
} from "./actions";

export const dynamic = "force-dynamic";

const ACCOUNT_TYPES = ["Expenditure", "Investment", "Income", "Transfer"] as const;

export default async function MappingTreePage() {
  const [natures, categoryAgg] = await Promise.all([
    prisma.expenseNature.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      include: {
        expenseTypes: {
          orderBy: [{ isActive: "desc" }, { name: "asc" }],
          include: {
            categories: {
              orderBy: [{ isActive: "desc" }, { name: "asc" }],
            },
          },
        },
      },
    }),
    prisma.transaction.groupBy({
      by: ["categoryId"],
      where: { categoryId: { not: null } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  const statsByCategory = new Map<string, { count: number; sum: number }>();
  for (const row of categoryAgg) {
    if (!row.categoryId) continue;
    statsByCategory.set(row.categoryId, {
      count: row._count._all,
      sum: Number(row._sum.amount ?? 0),
    });
  }

  // Flattened lists for parent-selection dropdowns.
  const allTypesFlat = natures.flatMap((n) =>
    n.expenseTypes.map((t) => ({ id: t.id, name: t.name, natureName: n.name, isActive: t.isActive }))
  );

  return (
    <div>
      <PageHeader
        title="Mapping Admin"
        subtitle="Nature → Type → Category hierarchy that drives categorization across the app."
      />
      <MappingTabs active="tree" />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add Expense Nature</h2>
        <form action={createExpenseNature} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Name
            <input
              name="name"
              required
              className="mt-1 w-56 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="e.g. Groceries &amp; Household"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Account Type
            <select name="accountType" required className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {ACCOUNT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add Nature
          </button>
        </form>
      </Card>

      {natures.length === 0 && <EmptyState>No expense natures yet.</EmptyState>}

      <div className="flex flex-col gap-3">
        {natures.map((nature) => {
          const typeRollups = nature.expenseTypes.map((t) => {
            const catStats = t.categories.map((c) => statsByCategory.get(c.id) ?? { count: 0, sum: 0 });
            return {
              count: catStats.reduce((a, s) => a + s.count, 0),
              sum: catStats.reduce((a, s) => a + s.sum, 0),
            };
          });
          const natureCount = typeRollups.reduce((a, r) => a + r.count, 0);
          const natureSum = typeRollups.reduce((a, r) => a + r.sum, 0);

          return (
            <Card key={nature.id} className="p-0">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400 transition-transform group-open:rotate-90">▸</span>
                    <span className="font-semibold text-slate-900">{nature.name}</span>
                    <Badge tone="blue">{nature.accountType}</Badge>
                    {!nature.isActive && <Badge tone="rose">inactive</Badge>}
                    <span className="text-xs text-slate-400">
                      {nature.expenseTypes.length} type{nature.expenseTypes.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {natureCount.toLocaleString("en-IN")} txns &middot; {formatINR(natureSum)}
                  </div>
                </summary>

                <div className="border-t border-slate-100 px-5 py-4">
                  <details className="mb-4">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
                      Edit nature
                    </summary>
                    <form action={updateExpenseNature} className="mt-2 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3">
                      <input type="hidden" name="id" value={nature.id} />
                      <label className="flex flex-col text-xs font-medium text-slate-600">
                        Name
                        <input
                          name="name"
                          defaultValue={nature.name}
                          required
                          className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <label className="flex flex-col text-xs font-medium text-slate-600">
                        Account Type
                        <select
                          name="accountType"
                          defaultValue={nature.accountType}
                          className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        >
                          {ACCOUNT_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-center gap-1.5 pb-1 text-xs font-medium text-slate-600">
                        <input type="checkbox" name="isActive" defaultChecked={nature.isActive} />
                        Active
                      </label>
                      <button
                        type="submit"
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                      >
                        Save
                      </button>
                    </form>
                  </details>

                  <details className="mb-4">
                    <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
                      + Add Expense Type under {nature.name}
                    </summary>
                    <form action={createExpenseType} className="mt-2 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3">
                      <input type="hidden" name="expenseNatureId" value={nature.id} />
                      <label className="flex flex-col text-xs font-medium text-slate-600">
                        Name
                        <input
                          name="name"
                          required
                          className="mt-1 w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
                        />
                      </label>
                      <button
                        type="submit"
                        className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                      >
                        Add Type
                      </button>
                    </form>
                  </details>

                  <div className="flex flex-col gap-2 border-l-2 border-slate-100 pl-4">
                    {nature.expenseTypes.length === 0 && (
                      <div className="text-xs text-slate-400">No expense types yet.</div>
                    )}
                    {nature.expenseTypes.map((type, idx) => {
                      const rollup = typeRollups[idx];
                      return (
                        <details key={type.id} className="group/type rounded-lg border border-slate-100">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 transition-transform group-open/type:rotate-90">▸</span>
                              <span className="font-medium text-slate-800">{type.name}</span>
                              {!type.isActive && <Badge tone="rose">inactive</Badge>}
                              <span className="text-xs text-slate-400">
                                {type.categories.length} categor{type.categories.length === 1 ? "y" : "ies"}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {rollup.count.toLocaleString("en-IN")} txns &middot; {formatINR(rollup.sum)}
                            </div>
                          </summary>

                          <div className="border-t border-slate-100 px-4 py-3">
                            <details className="mb-3">
                              <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
                                Edit type
                              </summary>
                              <form
                                action={updateExpenseType}
                                className="mt-2 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"
                              >
                                <input type="hidden" name="id" value={type.id} />
                                <label className="flex flex-col text-xs font-medium text-slate-600">
                                  Name
                                  <input
                                    name="name"
                                    defaultValue={type.name}
                                    required
                                    className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  />
                                </label>
                                <label className="flex flex-col text-xs font-medium text-slate-600">
                                  Parent Nature
                                  <select
                                    name="expenseNatureId"
                                    defaultValue={type.expenseNatureId}
                                    className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  >
                                    {natures.map((n) => (
                                      <option key={n.id} value={n.id}>
                                        {n.name}
                                        {!n.isActive ? " (inactive)" : ""}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="flex items-center gap-1.5 pb-1 text-xs font-medium text-slate-600">
                                  <input type="checkbox" name="isActive" defaultChecked={type.isActive} />
                                  Active
                                </label>
                                <button
                                  type="submit"
                                  className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                                >
                                  Save
                                </button>
                              </form>
                            </details>

                            <details className="mb-3">
                              <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700">
                                + Add Category under {type.name}
                              </summary>
                              <form
                                action={createCategory}
                                className="mt-2 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"
                              >
                                <input type="hidden" name="expenseTypeId" value={type.id} />
                                <label className="flex flex-col text-xs font-medium text-slate-600">
                                  Name
                                  <input
                                    name="name"
                                    required
                                    className="mt-1 w-56 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                  />
                                </label>
                                <button
                                  type="submit"
                                  className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                                >
                                  Add Category
                                </button>
                              </form>
                            </details>

                            <ul className="flex flex-col gap-1.5">
                              {type.categories.length === 0 && (
                                <li className="text-xs text-slate-400">No categories yet.</li>
                              )}
                              {type.categories.map((cat) => {
                                const stats = statsByCategory.get(cat.id) ?? { count: 0, sum: 0 };
                                return (
                                  <li key={cat.id} className="rounded-md border border-slate-100 px-3 py-1.5">
                                    <details>
                                      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                                        <span className="flex items-center gap-2 text-sm text-slate-800">
                                          {cat.name}
                                          {!cat.isActive && <Badge tone="rose">inactive</Badge>}
                                        </span>
                                        <span className="text-xs text-slate-500">
                                          {stats.count.toLocaleString("en-IN")} txns &middot; {formatINR(stats.sum)}
                                        </span>
                                      </summary>
                                      <form
                                        action={updateCategory}
                                        className="mt-2 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3"
                                      >
                                        <input type="hidden" name="id" value={cat.id} />
                                        <label className="flex flex-col text-xs font-medium text-slate-600">
                                          Name
                                          <input
                                            name="name"
                                            defaultValue={cat.name}
                                            required
                                            className="mt-1 w-48 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                          />
                                        </label>
                                        <label className="flex flex-col text-xs font-medium text-slate-600">
                                          Parent Type
                                          <select
                                            name="expenseTypeId"
                                            defaultValue={cat.expenseTypeId}
                                            className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
                                          >
                                            {allTypesFlat.map((t) => (
                                              <option key={t.id} value={t.id}>
                                                {t.natureName} / {t.name}
                                                {!t.isActive ? " (inactive)" : ""}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="flex items-center gap-1.5 pb-1 text-xs font-medium text-slate-600">
                                          <input type="checkbox" name="isActive" defaultChecked={cat.isActive} />
                                          Active
                                        </label>
                                        <button
                                          type="submit"
                                          className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                                        >
                                          Save
                                        </button>
                                      </form>
                                    </details>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </details>
                      );
                    })}
                  </div>
                </div>
              </details>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
