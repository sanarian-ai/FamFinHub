import { prisma } from "@/lib/prisma";
import { PageHeader, Card } from "@/components/ui";
import MappingTabs from "../MappingTabs";
import TestStringTool from "./TestStringTool";
import { createCategoryRule } from "../actions";
import { RulesTable, MATCH_TYPES } from "./RulesTable";

export const dynamic = "force-dynamic";

export default async function MappingRulesPage() {
  const [rules, categories] = await Promise.all([
    prisma.categoryRule.findMany({
      orderBy: [{ priority: "asc" }, { pattern: "asc" }],
      include: { category: { include: { expenseType: { include: { expenseNature: true } } } } },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { expenseType: { include: { expenseNature: true } } },
    }),
  ]);

  return (
    <div>
      <PageHeader
        title="Mapping Admin"
        subtitle="Category rules power auto-categorization for the Review Queue and the Gmail ingest pipeline."
      />
      <MappingTabs active="rules" />

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Test a description</h2>
        <p className="mb-3 text-xs text-slate-500">
          Paste a raw transaction description to see which active rule (if any) matches it, using the same{" "}
          <code>matchCategoryRule()</code> engine used everywhere else in the app.
        </p>
        <TestStringTool />
      </Card>

      <Card className="mb-6">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Add Category Rule</h2>
        <form action={createCategoryRule} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Match Type
            <select name="matchType" required className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm">
              {MATCH_TYPES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 min-w-56 flex-col text-xs font-medium text-slate-600">
            Pattern
            <input
              name="pattern"
              required
              className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
              placeholder="e.g. swiggy"
            />
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Category
            <select
              name="categoryId"
              required
              className="mt-1 w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.expenseType.expenseNature.name} / {c.expenseType.name} / {c.name}
                  {!c.isActive ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Priority
            <input
              name="priority"
              type="number"
              defaultValue={100}
              className="mt-1 w-20 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          >
            Add Rule
          </button>
        </form>
      </Card>

      <RulesTable rules={rules} categories={categories} />
    </div>
  );
}
