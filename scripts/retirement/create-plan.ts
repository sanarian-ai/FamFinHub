/**
 * Creates the household retirement plan with the Runway Ledger v10 baseline, once.
 * Run after the schema has been applied:  npx tsx scripts/retirement/create-plan.ts ["Plan name"]
 * Idempotent: if a non-archived plan with that name exists it prints its id and does nothing.
 */
import { PrismaClient } from "@prisma/client";
import { createPlan } from "../../src/lib/retirement";
import type { RetirementDb } from "../../src/lib/retirement";

/* eslint-disable @typescript-eslint/no-explicit-any */
const prisma: any = new PrismaClient();

async function main() {
  const name = process.argv[2] ?? "Household retirement plan";
  const existing = await prisma.retirementPlan.findFirst({ where: { name, archivedAt: null } });
  if (existing) { console.log(`Plan already exists: ${existing.id} (${name}). Nothing changed.`); return; }
  const id = await createPlan(prisma as RetirementDb, name);
  const n = await prisma.retirementBaselineItem.count({ where: { planId: id } });
  console.log(`Created plan ${id} (${name}) with ${n} baseline items.`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
