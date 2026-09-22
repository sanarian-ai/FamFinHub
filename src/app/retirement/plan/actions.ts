"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { addLifeEvent, deleteLifeEvent } from "@/lib/retirement";
import type { RetirementDb } from "@/lib/retirement";

// Same cast pattern as retirement/baseline/actions.ts and scripts/retirement/test-db.ts — the
// narrow RetirementDb interface has no index signature, so the generated Prisma client (a
// structural superset) needs an explicit cast.
const db = prisma as unknown as RetirementDb;

function revalidatePlan() {
  revalidatePath("/retirement/plan");
}

export async function addLifeEventAction(
  planId: string,
  e: { year: number; kind: "expense" | "inflow"; amount: number; label: string; note?: string },
): Promise<void> {
  await addLifeEvent(db, planId, e);
  revalidatePlan();
}

export async function deleteLifeEventAction(planId: string, eventId: string): Promise<void> {
  await deleteLifeEvent(db, planId, eventId);
  revalidatePlan();
}
