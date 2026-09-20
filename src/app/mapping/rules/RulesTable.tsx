"use client";

import { useMemo, useState, useTransition } from "react";
import clsx from "clsx";
import { Badge, Card, EmptyState } from "@/components/ui";
import type { RuleMatchType, RuleSource } from "@prisma/client";
import {
  toggleCategoryRuleActive,
  updateCategoryRuleAction,
  bulkUpdateCategoryRulesAction,
  type CategoryRuleBulkEdit,
} from "../actions";

export const MATCH_TYPES = ["exact", "contains", "regex"] as const;

const SOURCE_TONE: Record<string, "slate" | "amber" | "emerald" | "rose" | "blue"> = {
  seeded_from_history: "slate",
  user_defined: "blue",
  llm_suggested: "amber",
  review_queue_created: "emerald",
};

export interface RuleRow {
  id: string;
  matchType: RuleMatchType;
  pattern: string;
  categoryId: string;
  priority: number;
  source: RuleSource;
  isActive: boolean;
  category: { name: string; expenseType: { name: string; expenseNature: { name: string } } };
}

export interface CategoryOption {
  id: string;
  name: string;
  isActive: boolean;
  expenseType: { name: string; expenseNature: { name: string } };
}

const NO_CHANGE = "__no_change__";

type EditDraft = { matchType: RuleMatchType; pattern: string; categoryId: string; priority: number; isActive: boolean };

/**
 * The Rules table — search, per-row inline edit, and multi-select bulk edit (Match Type /
 * Category / Priority / Status). Pattern is deliberately single-row-only (see
 * bulkUpdateCategoryRulesAction's doc comment) — everything else can be changed one rule at a
 * time or across a whole selection in one shot, e.g. flipping a batch from "exact" to
 * "contains" or re-pointing several patterns at a different category. Search narrows which
 * rows exist to select ("Select all N" always means "all currently filtered", same convention
 * as the Review Queue's bulk bar) — with 500+ rules in this table, scrolling to hand-pick rows
 * without it wouldn't be practical.
 */
export function RulesTable({ rules, categories }: { rules: RuleRow[]; categories: CategoryOption[] }) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const searchTerm = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!searchTerm) return rules;
    return rules.filter(
      (r) =>
        r.pattern.toLowerCase().includes(searchTerm) ||
        r.category.name.toLowerCase().includes(searchTerm) ||
        r.category.expenseType.name.toLowerCase().includes(searchTerm) ||
        r.category.expenseType.expenseNature.name.toLowerCase().includes(searchTerm)
    );
  }, [rules, searchTerm]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function selectAllFiltered() {
    setSelected(new Set(filtered.map((r) => r.id)));
  }
  function clearSelection() {
    setSelected(new Set());
    setBulkOpen(false);
  }
  const selectedCount = selected.size;
  const allFilteredSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id));

  // --- single-row edit ---
  function startEdit(r: RuleRow) {
    setError(null);
    setEditingId(r.id);
    setEditDraft({ matchType: r.matchType, pattern: r.pattern, categoryId: r.categoryId, priority: r.priority, isActive: r.isActive });
  }
  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }
  function saveEdit() {
    if (!editingId || !editDraft) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateCategoryRuleAction(editingId, editDraft);
        setEditingId(null);
        setEditDraft(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
      }
    });
  }

  // --- bulk edit draft ---
  const [bulkMatchType, setBulkMatchType] = useState<string>(NO_CHANGE);
  const [bulkCategoryId, setBulkCategoryId] = useState<string>(NO_CHANGE);
  const [bulkPriority, setBulkPriority] = useState<string>("");
  const [bulkActive, setBulkActive] = useState<string>(NO_CHANGE);
  const bulkHasChange = bulkMatchType !== NO_CHANGE || bulkCategoryId !== NO_CHANGE || bulkPriority.trim() !== "" || bulkActive !== NO_CHANGE;

  function resetBulkDraft() {
    setBulkMatchType(NO_CHANGE);
    setBulkCategoryId(NO_CHANGE);
    setBulkPriority("");
    setBulkActive(NO_CHANGE);
  }

  function applyBulk() {
    if (!bulkHasChange || selectedCount === 0) return;
    setError(null);
    const changes: CategoryRuleBulkEdit = {};
    if (bulkMatchType !== NO_CHANGE) changes.matchType = bulkMatchType as RuleMatchType;
    if (bulkCategoryId !== NO_CHANGE) changes.categoryId = bulkCategoryId;
    if (bulkPriority.trim() !== "") {
      const p = parseInt(bulkPriority, 10);
      if (Number.isFinite(p)) changes.priority = p;
    }
    if (bulkActive !== NO_CHANGE) changes.isActive = bulkActive === "active";

    startTransition(async () => {
      try {
        await bulkUpdateCategoryRulesAction(Array.from(selected), changes);
        clearSelection();
        resetBulkDraft();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't save — please try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search pattern or category…"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span>
            {filtered.length} of {rules.length} rule{rules.length === 1 ? "" : "s"}
            {searchTerm && (
              <>
                {" "}
                match &ldquo;{searchTerm}&rdquo;
              </>
            )}
          </span>
          {filtered.length > 0 && (
            <button type="button" onClick={selectAllFiltered} className="font-medium text-indigo-600 hover:underline">
              Select all {filtered.length}
            </button>
          )}
          {selectedCount > 0 && (
            <button type="button" onClick={clearSelection} className="font-medium text-slate-500 hover:underline">
              Clear selection
            </button>
          )}
        </div>
      </Card>

      {selectedCount > 0 && (
        <Card className="sticky top-2 z-10 border-indigo-200 bg-indigo-50">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-indigo-900">
              {selectedCount} rule{selectedCount === 1 ? "" : "s"} selected
            </span>
            {!bulkOpen ? (
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
              >
                Edit selected…
              </button>
            ) : (
              <div className="w-full rounded-lg border border-indigo-200 bg-white p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col text-xs font-medium text-slate-600">
                    Match Type
                    <select
                      value={bulkMatchType}
                      onChange={(e) => setBulkMatchType(e.target.value)}
                      className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value={NO_CHANGE}>— no change —</option>
                      {MATCH_TYPES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex flex-col text-xs font-medium text-slate-600">
                    Category
                    <select
                      value={bulkCategoryId}
                      onChange={(e) => setBulkCategoryId(e.target.value)}
                      className="mt-1 w-64 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value={NO_CHANGE}>— no change —</option>
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
                      type="number"
                      value={bulkPriority}
                      onChange={(e) => setBulkPriority(e.target.value)}
                      placeholder="no change"
                      className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    />
                  </label>
                  <label className="flex flex-col text-xs font-medium text-slate-600">
                    Status
                    <select
                      value={bulkActive}
                      onChange={(e) => setBulkActive(e.target.value)}
                      className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                    >
                      <option value={NO_CHANGE}>— no change —</option>
                      <option value="active">Activate</option>
                      <option value="inactive">Deactivate</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!bulkHasChange || isPending}
                    onClick={applyBulk}
                    className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                  >
                    {isPending ? "Applying…" : `Apply to ${selectedCount}`}
                  </button>
                  <button type="button" onClick={() => setBulkOpen(false)} className="text-xs text-slate-500 hover:underline">
                    Cancel
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  Only fields you change are applied — leave the rest as &ldquo;no change&rdquo;. Pattern isn&rsquo;t bulk-editable; edit
                  one rule&rsquo;s pattern at a time below.
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      {error && (
        <Card className="border-rose-200 bg-rose-50">
          <p className="text-xs font-medium text-rose-700">{error}</p>
        </Card>
      )}

      <Card className="p-0">
        <div className="overflow-x-auto">
          {filtered.length === 0 ? (
            <div className="p-5">
              <EmptyState>{rules.length === 0 ? "No category rules yet." : "No rules match your search."}</EmptyState>
            </div>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">
                    <input
                      type="checkbox"
                      aria-label="Select all filtered rules"
                      checked={allFilteredSelected}
                      onChange={(e) => (e.target.checked ? selectAllFiltered() : clearSelection())}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </th>
                  <th className="px-4 py-3 font-medium">Pattern</th>
                  <th className="px-4 py-3 font-medium">Match Type</th>
                  <th className="px-4 py-3 font-medium">Category</th>
                  <th className="px-4 py-3 font-medium">Priority</th>
                  <th className="px-4 py-3 font-medium">Source</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rule) =>
                  editingId === rule.id && editDraft ? (
                    <tr key={rule.id} className="border-b border-slate-100 bg-indigo-50/60">
                      <td className="px-4 py-2"></td>
                      <td className="px-4 py-2">
                        <input
                          value={editDraft.pattern}
                          onChange={(e) => setEditDraft({ ...editDraft, pattern: e.target.value })}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 font-mono text-xs"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editDraft.matchType}
                          onChange={(e) => setEditDraft({ ...editDraft, matchType: e.target.value as RuleMatchType })}
                          className="rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          {MATCH_TYPES.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <select
                          value={editDraft.categoryId}
                          onChange={(e) => setEditDraft({ ...editDraft, categoryId: e.target.value })}
                          className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs"
                        >
                          {categories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.expenseType.expenseNature.name} / {c.expenseType.name} / {c.name}
                              {!c.isActive ? " (inactive)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input
                          type="number"
                          value={editDraft.priority}
                          onChange={(e) => setEditDraft({ ...editDraft, priority: parseInt(e.target.value, 10) || 0 })}
                          className="w-16 rounded-md border border-slate-300 px-2 py-1 text-xs"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Badge tone={SOURCE_TONE[rule.source] ?? "slate"}>{rule.source}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={editDraft.isActive}
                            onChange={(e) => setEditDraft({ ...editDraft, isActive: e.target.checked })}
                          />
                          Active
                        </label>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={saveEdit}
                            className="text-xs font-medium text-indigo-600 hover:underline disabled:opacity-50"
                          >
                            {isPending ? "Saving…" : "Save"}
                          </button>
                          <button type="button" onClick={cancelEdit} className="text-xs font-medium text-slate-500 hover:underline">
                            Cancel
                          </button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={rule.id} className={clsx("border-b border-slate-100", !rule.isActive && "opacity-50")}>
                      <td className="px-4 py-2">
                        <input
                          type="checkbox"
                          checked={selected.has(rule.id)}
                          onChange={() => toggleRow(rule.id)}
                          aria-label={`Select ${rule.pattern}`}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{rule.pattern}</td>
                      <td className="px-4 py-2 text-slate-600">{rule.matchType}</td>
                      <td className="px-4 py-2 text-slate-800">
                        {rule.category.name}
                        <div className="text-xs text-slate-400">
                          {rule.category.expenseType.expenseNature.name} / {rule.category.expenseType.name}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{rule.priority}</td>
                      <td className="px-4 py-2">
                        <Badge tone={SOURCE_TONE[rule.source] ?? "slate"}>{rule.source}</Badge>
                      </td>
                      <td className="px-4 py-2">
                        {rule.isActive ? <Badge tone="emerald">active</Badge> : <Badge tone="rose">inactive</Badge>}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-3">
                          <button
                            type="button"
                            onClick={() => startEdit(rule)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline"
                          >
                            Edit
                          </button>
                          <form action={toggleCategoryRuleActive}>
                            <input type="hidden" name="id" value={rule.id} />
                            <input type="hidden" name="nextActive" value={(!rule.isActive).toString()} />
                            <button type="submit" className="text-xs font-medium text-slate-500 hover:text-slate-800 hover:underline">
                              {rule.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
