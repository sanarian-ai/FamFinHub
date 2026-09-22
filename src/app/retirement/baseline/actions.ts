"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { addLifeEvent, deleteLifeEvent, markBaselineReviewed, setBaselineValue } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";
import { getLedgerActuals } from "./data";

// The narrow RetirementDb interface (Record<string, Delegate>) lets persist.ts run against a
// scratch DB in tests without depending on generated Prisma types; the real client is a
// structural superset, so this cast is safe and matches the pattern used in scripts/retirement/.
const db = prisma as unknown as RetirementDb;

function revalidateBaseline() {
  revalidatePath("/retirement/baseline");
}

/** Direct client call (not a form action) — mirrors updateCategoryRuleAction in mapping/actions.ts. */
export async function saveBaselineValueAction(planId: string, key: string, valueL: number): Promise<void> {
  await setBaselineValue(db, planId, key, valueL);
  revalidateBaseline();
}

/** "I looked at the ledger reference and I'm keeping my number." Value is untouched — only lastReviewedAt moves. */
export async function markReviewedAction(planId: string, key: string): Promise<void> {
  await markBaselineReviewed(db, planId, key);
  revalidateBaseline();
}

/**
 * Overwrites the manual value with the current trailing-12-month ledger actual, converted to the
 * item's own unit (monthly items get the 12-month total divided by 12; annual items get the
 * 12-month total as-is). Still an explicit user action — the ledger is never written silently.
 */
export async function useLedgerValueAction(planId: string, key: string, unit: "monthly" | "annual" | "lump"): Promise<void> {
  if (unit === "lump") throw new Error("No ledger reference applies to a lump-sum item.");
  const actuals = await getLedgerActuals(planId);
  const a = actuals[key];
  if (!a) throw new Error("No ledger reference for " + key);
  const value = unit === "monthly" ? a.totalL / 12 : a.totalL;
  await setBaselineValue(db, planId, key, Math.round(value * 10000) / 10000);
  revalidateBaseline();
}

export async function addLifeEventAction(
  planId: string,
  e: { year: number; kind: "expense" | "inflow"; amount: number; label: string; note?: string },
): Promise<void> {
  await addLifeEvent(db, planId, e);
  revalidateBaseline();
}

export async function deleteLifeEventAction(planId: string, eventId: string): Promise<void> {
  await deleteLifeEvent(db, planId, eventId);
  revalidateBaseline();
}
