/**
 * Database layer for retirement plans. Takes the Prisma client as a parameter (never imports the
 * app singleton), so it can be exercised against a scratch database, and uses a narrow structural
 * type so it compiles before `prisma generate` has produced the new models.
 * Rules: a baseline value is only ever changed by an explicit user call here; nothing syncs into it.
 */
import {
  BASELINE_KEYS, ENGINE_VERSION, baselineToItems, buildSnapshot, defaultPlanState, evaluate, itemsToBaseline,
  validateAssumptions, validateEvent, validateParams,
} from "./store";
import { NETWORTH_KEYS } from "./networth";
import type { BaselineItemInput, PlanState, Snapshot } from "./store";
import type { CustomEvent } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Delegate = Record<string, (args?: any) => Promise<any>>;
export interface RetirementDb {
  retirementPlan: Delegate;
  retirementBaselineItem: Delegate;
  retirementLifeEvent: Delegate;
  retirementPlanVersion: Delegate;
  retirementBaselineLink: Delegate;
  $transaction: <T>(fn: (tx: RetirementDb) => Promise<T>) => Promise<T>;
}

const dec = (v: unknown): number => Number(String(v));

export interface LoadedPlan {
  id: string; name: string; driftThresholdPct: number; archivedAt: Date | null;
  state: PlanState;
  items: (BaselineItemInput & { id: string; lastReviewedAt: Date; note: string | null })[];
  events: (CustomEvent & { id: string; note: string | null })[];
}

export async function createPlan(db: RetirementDb, name: string): Promise<string> {
  if (!name.trim()) throw new Error("Plan name is required");
  const s = defaultPlanState();
  return db.$transaction(async (tx) => {
    const plan = await tx.retirementPlan.create({ data: { name: name.trim(), params: s.params, assumptions: s.assumptions } });
    await tx.retirementBaselineItem.createMany({
      data: baselineToItems(s.baseline).map((i) => ({ ...i, planId: plan.id })),
    });
    return plan.id as string;
  });
}

export async function loadPlan(db: RetirementDb, planId: string): Promise<LoadedPlan> {
  const p = await db.retirementPlan.findUnique({
    where: { id: planId },
    include: { baselineItems: { orderBy: { sortOrder: "asc" } }, lifeEvents: { orderBy: [{ year: "asc" }, { createdAt: "asc" }] } },
  });
  if (!p) throw new Error("Plan not found: " + planId);
  const items = p.baselineItems.map((i: any) => ({
    id: i.id, key: i.key, label: i.label, group: i.group, unit: i.unit, valueL: dec(i.valueL),
    sortOrder: i.sortOrder, lastReviewedAt: i.lastReviewedAt as Date, note: i.note as string | null,
  }));
  const events = p.lifeEvents.map((e: any) => ({
    id: e.id, year: e.year, label: e.label, kind: e.kind, amt: dec(e.amountL), note: e.note as string | null,
  }));
  return {
    id: p.id, name: p.name, driftThresholdPct: dec(p.driftThresholdPct), archivedAt: p.archivedAt,
    state: {
      params: validateParams(p.params), assumptions: validateAssumptions(p.assumptions),
      baseline: itemsToBaseline(items), events: events.map((e: any) => ({ year: e.year, label: e.label, kind: e.kind, amt: e.amt })),
    },
    items, events,
  };
}

/**
 * Typing a new value counts as a review. The ledger reference is never consulted or written.
 * Accepts both engine keys (BASELINE_KEYS, feed compute()) and tracked-only net worth keys
 * (NETWORTH_KEYS, never touched by compute()) — both live in the same RetirementBaselineItem table.
 */
export async function setBaselineValue(db: RetirementDb, planId: string, key: string, valueL: number, note?: string | null) {
  if (!BASELINE_KEYS.includes(key) && !key.startsWith("networth.")) throw new Error("Unknown baseline key: " + key);
  if (!Number.isFinite(valueL) || valueL < 0) throw new Error("Baseline value must be a non-negative number");
  return db.retirementBaselineItem.update({
    where: { planId_key: { planId, key } },
    data: { valueL, lastReviewedAt: new Date(), ...(note !== undefined ? { note } : {}) },
  });
}

/** "I looked at the ledger reference and I am keeping my number." Value unchanged. */
export async function markBaselineReviewed(db: RetirementDb, planId: string, key: string) {
  if (!BASELINE_KEYS.includes(key) && !key.startsWith("networth.")) throw new Error("Unknown baseline key: " + key);
  return db.retirementBaselineItem.update({ where: { planId_key: { planId, key } }, data: { lastReviewedAt: new Date() } });
}

/**
 * Adds a user-defined, tracked-only net-worth bucket alongside the 13 built-in NETWORTH_CLASSES.
 * Key is derived from the label (slugified, prefixed networth.custom. so it can never collide with
 * a built-in key) - never touched by compute(), same as every other networth.* item.
 */
export async function addNetWorthItem(db: RetirementDb, planId: string, label: string, valueL: number): Promise<string> {
  const trimmed = label.trim();
  if (!trimmed) throw new Error("Label is required");
  if (trimmed.length > 60) throw new Error("Label must be 60 characters or fewer");
  if (!Number.isFinite(valueL) || valueL < 0) throw new Error("Value must be a non-negative number");
  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) throw new Error("Label must contain at least one letter or number");
  const key = `networth.custom.${slug}`;
  const existing = await db.retirementBaselineItem.findFirst({ where: { planId, key } });
  if (existing) throw new Error(`An asset bucket with a matching name already exists: ${trimmed}`);
  const siblings = await db.retirementBaselineItem.findMany({ where: { planId, group: "netWorth" } });
  const sortOrder = siblings.reduce((max: number, i: { sortOrder: number }) => Math.max(max, i.sortOrder), -1) + 1;
  await db.retirementBaselineItem.create({
    data: { planId, key, label: trimmed, group: "netWorth", unit: "lump", valueL, sortOrder },
  });
  return key;
}

/**
 * Removes a net-worth bucket the user added themselves. Restricted to keys outside the 13 built-in
 * NETWORTH_KEYS - the seeded classes can never be deleted through this path, only ones created via
 * addNetWorthItem, so a slip here can't silently zero out part of the tracked-net-worth figure that
 * has no "add it back" flow.
 */
export async function removeNetWorthItem(db: RetirementDb, planId: string, key: string): Promise<void> {
  if (NETWORTH_KEYS.includes(key)) throw new Error("This is one of the built-in asset classes and can't be removed here.");
  if (!key.startsWith("networth.")) throw new Error("Not a net-worth item: " + key);
  const item = await db.retirementBaselineItem.findFirst({ where: { planId, key } });
  if (!item) throw new Error("Asset bucket not found: " + key);
  await db.retirementBaselineItem.delete({ where: { id: item.id } });
}

export async function setPlanInputs(db: RetirementDb, planId: string, params: unknown, assumptions: unknown, driftThresholdPct?: number) {
  const data: Record<string, unknown> = { params: validateParams(params), assumptions: validateAssumptions(assumptions) };
  if (driftThresholdPct !== undefined) {
    if (!Number.isFinite(driftThresholdPct) || driftThresholdPct <= 0 || driftThresholdPct > 100) throw new Error("driftThresholdPct must be 0..100");
    data.driftThresholdPct = driftThresholdPct;
  }
  return db.retirementPlan.update({ where: { id: planId }, data });
}

export async function addLifeEvent(db: RetirementDb, planId: string, e: { year: number; kind: string; amount: number; label: string; note?: string }) {
  const v = validateEvent(e);
  return db.retirementLifeEvent.create({ data: { planId, year: v.year, kind: v.kind, amountL: v.amt, label: e.label.trim() || "Event", note: e.note ?? null } });
}
export async function deleteLifeEvent(db: RetirementDb, planId: string, eventId: string) {
  const r = await db.retirementLifeEvent.deleteMany({ where: { id: eventId, planId } });
  if (!r.count) throw new Error("Event not found in this plan");
}

/** Immutable snapshot of the current inputs plus the result they produce. Version numbers are gap-free per plan. */
export async function saveVersion(db: RetirementDb, planId: string, label?: string, paths = 10000) {
  const plan = await loadPlan(db, planId);
  const ev = evaluate(plan.state, paths);
  const snap: Snapshot = buildSnapshot(plan.state, plan.items);
  // Two saves racing for the same number hit the unique (planId, version) constraint; retry with a fresh read.
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const last = await tx.retirementPlanVersion.findFirst({ where: { planId }, orderBy: { version: "desc" } });
        return tx.retirementPlanVersion.create({
          data: {
            planId, version: (last?.version ?? 0) + 1, label: label ?? null, snapshot: snap as unknown as object,
            engineVersion: ENGINE_VERSION, successPct: ev.successPct, band: ev.band, depletionYear: ev.depletionYear,
          },
        });
      });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002" && attempt < 6) continue;
      throw e;
    }
  }
}

export async function listVersions(db: RetirementDb, planId: string) {
  const v = await db.retirementPlanVersion.findMany({ where: { planId }, orderBy: { version: "asc" } });
  return v.map((x: any) => ({
    id: x.id as string, version: x.version as number, label: x.label as string | null, createdAt: x.createdAt as Date,
    successPct: x.successPct == null ? null : dec(x.successPct), band: x.band as string | null,
    depletionYear: x.depletionYear as number | null, engineVersion: x.engineVersion as string,
  }));
}
