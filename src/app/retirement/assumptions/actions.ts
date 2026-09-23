"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { setPlanInputs } from "@/lib/retirement";
import type { Assumptions, Params, RetirementDb } from "@/lib/retirement";

const db = prisma as unknown as RetirementDb;

/**
 * Persists the full Params + Assumptions objects (setPlanInputs/validateParams require every key
 * present - the client always round-trips the whole object, including the fields this v1 form
 * doesn't expose: mult, st, shiftOn). Revalidates every page whose numbers derive from these
 * inputs: the deterministic PV figures recompute on next load; the Monte Carlo success% badge
 * stays on its existing explicit-trigger pattern and simply needs a fresh click.
 */
export async function saveAssumptionsAction(planId: string, params: Params, assumptions: Assumptions): Promise<void> {
  await setPlanInputs(db, planId, params, assumptions);
  revalidatePath("/retirement/assumptions");
  revalidatePath("/retirement/plan");
  revalidatePath("/retirement/stress");
  revalidatePath("/retirement/expenses");
  revalidatePath("/retirement/assets");
  revalidatePath("/retirement/baseline");
}
