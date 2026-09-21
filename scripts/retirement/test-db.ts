/**
 * M2 database integration test. Run against a SCRATCH database only:
 *   DATABASE_URL=postgresql://...@localhost:PORT/scratch DIRECT_URL=... npx tsx scripts/retirement/test-db.ts
 * Refuses to run unless the URL points at localhost / 127.0.0.1, and never touches non-retirement rows
 * except the single throwaway Category it creates (and removes) to test the ledger-link foreign key.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import {
  addLifeEvent, createPlan, defaultPlanState, deleteLifeEvent, evaluate, listVersions, loadPlan, markBaselineReviewed,
  saveVersion, setBaselineValue, setPlanInputs, stateFromSnapshot,
} from "../../src/lib/retirement";
import type { RetirementDb, Snapshot } from "../../src/lib/retirement";

const url = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) { console.error("Refusing to run: DATABASE_URL is not localhost."); process.exit(2); }

// Deliberately untyped: this script must type-check both before and after `prisma generate` has produced the new models.
/* eslint-disable @typescript-eslint/no-explicit-any */
const prisma: any = new PrismaClient();
const db = prisma as RetirementDb;
let pass = 0, fail = 0;
async function t(name: string, fn: () => Promise<void>) { try { await fn(); pass++; } catch (e) { fail++; console.error("FAIL", name, "\n  ", (e as Error).message); } }
const rejects = (p: Promise<unknown>, re: RegExp) => assert.rejects(p, re);

async function main() {
  const planId = await createPlan(db, "Test plan");

  await t("new plan loads with the default state, exactly", async () => {
    const p = await loadPlan(db, planId);
    assert.deepEqual(p.state, defaultPlanState());
    assert.equal(p.items.length, 20); assert.equal(p.driftThresholdPct, 10);
    assert.deepEqual(evaluate(p.state), evaluate(defaultPlanState()));
  });

  await t("typing a baseline value stores it and marks it reviewed; other rows untouched", async () => {
    const before = await loadPlan(db, planId);
    await new Promise((r) => setTimeout(r, 20));
    await setBaselineValue(db, planId, "sub.food", 0.62, "raised after LTM review");
    const after = await loadPlan(db, planId);
    const f0 = before.items.find((i) => i.key === "sub.food")!, f1 = after.items.find((i) => i.key === "sub.food")!;
    assert.equal(f1.valueL, 0.62); assert.equal(f1.note, "raised after LTM review");
    assert.ok(f1.lastReviewedAt > f0.lastReviewedAt);
    for (const i of after.items.filter((x) => x.key !== "sub.food")) {
      const o = before.items.find((x) => x.key === i.key)!;
      assert.equal(i.valueL, o.valueL); assert.equal(+i.lastReviewedAt, +o.lastReviewedAt);
    }
  });

  await t("'keep my number' advances the review date and leaves the value", async () => {
    const b = (await loadPlan(db, planId)).items.find((i) => i.key === "sub.home")!;
    await new Promise((r) => setTimeout(r, 20));
    await markBaselineReviewed(db, planId, "sub.home");
    const a = (await loadPlan(db, planId)).items.find((i) => i.key === "sub.home")!;
    assert.equal(a.valueL, b.valueL); assert.ok(a.lastReviewedAt > b.lastReviewedAt);
  });

  await t("bad baseline writes are rejected before touching the database", async () => {
    await rejects(setBaselineValue(db, planId, "sub.nope", 1), /Unknown baseline key/);
    await rejects(setBaselineValue(db, planId, "health", -3), /non-negative/);
    await rejects(setBaselineValue(db, planId, "health", NaN), /non-negative/);
    assert.equal((await loadPlan(db, planId)).items.find((i) => i.key === "health")!.valueL, 2.76);
  });

  await t("invalid params are rejected and the stored params do not change", async () => {
    const p = (await loadPlan(db, planId)).state;
    await rejects(setPlanInputs(db, planId, { ...p.params, r: 99 }, p.assumptions), /r: 99 outside/);
    assert.deepEqual((await loadPlan(db, planId)).state.params, p.params);
  });

  await t("valid params and drift threshold persist", async () => {
    const p = (await loadPlan(db, planId)).state;
    await setPlanInputs(db, planId, { ...p.params, riaG: 4 }, p.assumptions, 15);
    const a = await loadPlan(db, planId);
    assert.equal(a.state.params.riaG, 4); assert.equal(a.driftThresholdPct, 15);
    await rejects(setPlanInputs(db, planId, a.state.params, a.state.assumptions, 0), /driftThresholdPct/);
  });

  await t("life events: add, order by year, validate, delete only within the plan", async () => {
    await addLifeEvent(db, planId, { year: 2033, kind: "expense", amount: 40, label: "car" });
    await addLifeEvent(db, planId, { year: 2029, kind: "inflow", amount: 25, label: "gift" });
    const p = await loadPlan(db, planId);
    assert.deepEqual(p.events.map((e) => e.year), [2029, 2033]);
    assert.deepEqual(p.state.events, [{ year: 2029, label: "gift", kind: "inflow", amt: 25 }, { year: 2033, label: "car", kind: "expense", amt: 40 }]);
    await rejects(addLifeEvent(db, planId, { year: 2010, kind: "expense", amount: 1, label: "x" }), /year/);
    const other = await createPlan(db, "Other plan");
    await rejects(deleteLifeEvent(db, other, p.events[0].id), /not found in this plan/);
    await deleteLifeEvent(db, planId, p.events[0].id);
    assert.equal((await loadPlan(db, planId)).events.length, 1);
  });

  let v1: { id: string; version: number; successPct: unknown };
  await t("saveVersion records inputs and the verdict they produce", async () => {
    const live = evaluate((await loadPlan(db, planId)).state);
    v1 = await saveVersion(db, planId, "baseline review");
    assert.equal(v1.version, 1); assert.equal(Number(String(v1.successPct)), live.successPct);
    const [row] = await listVersions(db, planId);
    assert.equal(row.band, live.band); assert.equal(row.engineVersion, "1.0.0"); assert.equal(row.depletionYear, live.depletionYear);
  });

  await t("old versions stay reproducible after the plan changes", async () => {
    await setBaselineValue(db, planId, "sub.travel", 2.4);
    const v2 = await saveVersion(db, planId, "travel up");
    assert.equal(v2.version, 2);
    const rows = await listVersions(db, planId);
    assert.ok(rows[1].successPct! < rows[0].successPct!, "raising travel must lower the success rate");
    const stored = await prisma.retirementPlanVersion.findUnique({ where: { id: v1.id } });
    const snap = stored!.snapshot as unknown as Snapshot;
    const re = evaluate(stateFromSnapshot(snap));
    assert.equal(re.successPct, rows[0].successPct); assert.equal(re.band, rows[0].band);
    assert.equal(snap.baseline.find((i) => i.key === "sub.travel")!.valueL, 1.02);
  });

  await t("five concurrent saves get gap-free unique version numbers", async () => {
    await Promise.all([1, 2, 3, 4, 5].map((i) => saveVersion(db, planId, "race " + i, 1000)));
    assert.deepEqual((await listVersions(db, planId)).map((v: { version: number }) => v.version), [1, 2, 3, 4, 5, 6, 7]);
  });

  await t("duplicate version numbers are impossible at the database level", async () => {
    await assert.rejects(prisma.retirementPlanVersion.create({ data: { planId, version: 3, snapshot: {}, engineVersion: "x" } }), (e: { code?: string }) => e.code === "P2002");
  });

  await t("ledger link is a real foreign key: it needs an existing category, and blocks its deletion", async () => {
    const nat = await prisma.expenseNature.create({ data: { name: "ZZ_M2_TEST_NATURE", accountType: "Expenditure" } });
    const typ = await prisma.expenseType.create({ data: { name: "ZZ_M2_TEST_TYPE", expenseNatureId: nat.id } });
    const cat = await prisma.category.create({ data: { name: "ZZ_M2_TEST_CAT", expenseTypeId: typ.id } });
    try {
      const item = await prisma.retirementBaselineItem.findFirst({ where: { planId, key: "sub.food" } });
      await prisma.retirementBaselineLink.create({ data: { itemId: item!.id, categoryId: cat.id } });
      await assert.rejects(prisma.retirementBaselineLink.create({ data: { itemId: item!.id, categoryId: "no-such-category" } }));
      await assert.rejects(prisma.category.delete({ where: { id: cat.id } }));
    } finally {
      await prisma.retirementBaselineLink.deleteMany({ where: { categoryId: cat.id } });
      await prisma.category.delete({ where: { id: cat.id } });
      await prisma.expenseType.delete({ where: { id: typ.id } });
      await prisma.expenseNature.delete({ where: { id: nat.id } });
    }
  });

  await t("deleting a plan cascades to its items, events, versions and links", async () => {
    await prisma.retirementPlan.deleteMany({ where: { name: { in: ["Test plan", "Other plan"] } } });
    for (const m of ["retirementBaselineItem", "retirementLifeEvent", "retirementPlanVersion", "retirementBaselineLink"] as const)
      assert.equal(await prisma[m].count(), 0, m);
  });

  console.log(`retirement db: ${pass} passed, ${fail} failed`);
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
