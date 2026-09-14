"use client";

import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { testDescription, TestStringResult } from "../actions";

export default function TestStringTool() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<TestStringResult | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = input;
    startTransition(async () => {
      const r = await testDescription(value);
      setResult(r);
      setHasSubmitted(true);
    });
  }

  return (
    <div>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 min-w-64 flex-col text-xs font-medium text-slate-600">
          Raw transaction description
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="e.g. UPI/DR/123456/SWIGGY/..."
            className="mt-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={isPending || !input.trim()}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {isPending ? "Testing…" : "Test"}
        </button>
      </form>

      {hasSubmitted && result && (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
          {result.matched ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Badge tone="emerald">matched</Badge>
                <span className="font-medium text-slate-900">{result.categoryName}</span>
                <span className="text-slate-400">
                  ({result.expenseNatureName} / {result.expenseTypeName})
                </span>
              </div>
              <div className="text-xs text-slate-500">
                Rule: <code className="rounded bg-white px-1 py-0.5">{result.rulePattern}</code>{" "}
                ({result.ruleMatchType}, priority {result.rulePriority})
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Badge tone="amber">no match</Badge>
              <span className="text-slate-600">
                This description would land in the Review Queue for manual categorization.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
