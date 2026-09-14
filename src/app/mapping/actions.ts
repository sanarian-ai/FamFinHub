"use server";

import { prisma } from "@/lib/prisma";
import { matchCategoryRule } from "@/lib/categorize";
import { revalidatePath } from "next/cache";
import {
  AccountTypeEnum,
  AccountKind,
  RuleMatchType,
  RuleSource,
} from "@prisma/client";

const MAPPING_PATHS = ["/mapping", "/mapping/rules", "/mapping/accounts"] as const;

function revalidateMapping() {
  for (const p of MAPPING_PATHS) revalidatePath(p);
}

function str(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function checked(formData: FormData, key: string): boolean {
  // HTML checkboxes only appear in FormData when checked.
  return formData.get(key) != null;
}

// ---------------------------------------------------------------------------
// ExpenseNature
// ---------------------------------------------------------------------------

export async function createExpenseNature(formData: FormData) {
  const name = str(formData, "name");
  const accountType = str(formData, "accountType") as AccountTypeEnum;
  if (!name || !accountType) return;

  try {
    await prisma.expenseNature.create({ data: { name, accountType } });
  } catch (e) {
    console.error("createExpenseNature failed", e);
  }
  revalidateMapping();
}

export async function updateExpenseNature(formData: FormData) {
  const id = str(formData, "id");
  const name = str(formData, "name");
  const accountType = str(formData, "accountType") as AccountTypeEnum;
  const isActive = checked(formData, "isActive");
  if (!id || !name || !accountType) return;

  try {
    await prisma.expenseNature.update({
      where: { id },
      data: { name, accountType, isActive },
    });
  } catch (e) {
    console.error("updateExpenseNature failed", e);
  }
  revalidateMapping();
}

// ---------------------------------------------------------------------------
// ExpenseType
// ---------------------------------------------------------------------------

export async function createExpenseType(formData: FormData) {
  const name = str(formData, "name");
  const expenseNatureId = str(formData, "expenseNatureId");
  if (!name || !expenseNatureId) return;

  try {
    await prisma.expenseType.create({ data: { name, expenseNatureId } });
  } catch (e) {
    console.error("createExpenseType failed", e);
  }
  revalidateMapping();
}

export async function updateExpenseType(formData: FormData) {
  const id = str(formData, "id");
  const name = str(formData, "name");
  const expenseNatureId = str(formData, "expenseNatureId");
  const isActive = checked(formData, "isActive");
  if (!id || !name || !expenseNatureId) return;

  try {
    await prisma.expenseType.update({
      where: { id },
      data: { name, expenseNatureId, isActive },
    });
  } catch (e) {
    console.error("updateExpenseType failed", e);
  }
  revalidateMapping();
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export async function createCategory(formData: FormData) {
  const name = str(formData, "name");
  const expenseTypeId = str(formData, "expenseTypeId");
  if (!name || !expenseTypeId) return;

  try {
    await prisma.category.create({ data: { name, expenseTypeId } });
  } catch (e) {
    console.error("createCategory failed", e);
  }
  revalidateMapping();
}

export async function updateCategory(formData: FormData) {
  const id = str(formData, "id");
  const name = str(formData, "name");
  const expenseTypeId = str(formData, "expenseTypeId");
  const isActive = checked(formData, "isActive");
  if (!id || !name || !expenseTypeId) return;

  try {
    await prisma.category.update({
      where: { id },
      data: { name, expenseTypeId, isActive },
    });
  } catch (e) {
    console.error("updateCategory failed", e);
  }
  revalidateMapping();
}

// ---------------------------------------------------------------------------
// CategoryRule
// ---------------------------------------------------------------------------

export async function createCategoryRule(formData: FormData) {
  const matchType = str(formData, "matchType") as RuleMatchType;
  const pattern = str(formData, "pattern");
  const categoryId = str(formData, "categoryId");
  const priorityRaw = str(formData, "priority");
  const priority = priorityRaw ? parseInt(priorityRaw, 10) : 100;
  if (!matchType || !pattern || !categoryId) return;

  try {
    await prisma.categoryRule.create({
      data: {
        matchType,
        pattern,
        categoryId,
        priority: Number.isFinite(priority) ? priority : 100,
        source: "user_defined" as RuleSource,
      },
    });
  } catch (e) {
    console.error("createCategoryRule failed", e);
  }
  revalidateMapping();
}

export async function toggleCategoryRuleActive(formData: FormData) {
  const id = str(formData, "id");
  const nextActive = str(formData, "nextActive") === "true";
  if (!id) return;

  try {
    await prisma.categoryRule.update({ where: { id }, data: { isActive: nextActive } });
  } catch (e) {
    console.error("toggleCategoryRuleActive failed", e);
  }
  revalidateMapping();
}

export type TestStringResult =
  | { matched: true; categoryName: string; expenseTypeName: string; expenseNatureName: string; rulePattern: string; ruleMatchType: string; rulePriority: number }
  | { matched: false };

export async function testDescription(raw: string): Promise<TestStringResult> {
  const trimmed = raw.trim();
  if (!trimmed) return { matched: false };

  const result = await matchCategoryRule(trimmed);
  if (!result) return { matched: false };

  const category = await prisma.category.findUnique({
    where: { id: result.category.id },
    include: { expenseType: { include: { expenseNature: true } } },
  });

  return {
    matched: true,
    categoryName: result.category.name,
    expenseTypeName: category?.expenseType.name ?? "",
    expenseNatureName: category?.expenseType.expenseNature.name ?? "",
    rulePattern: result.rule.pattern,
    ruleMatchType: result.rule.matchType,
    rulePriority: result.rule.priority,
  };
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------

export async function updateAccount(formData: FormData) {
  const id = str(formData, "id");
  const holder = str(formData, "holder");
  const accountKind = str(formData, "accountKind") as AccountKind;
  const institutionRaw = str(formData, "institution");
  const institution = institutionRaw || null;
  const isActive = checked(formData, "isActive");
  if (!id || !holder || !accountKind) return;

  try {
    await prisma.account.update({
      where: { id },
      data: { holder, accountKind, institution, isActive },
    });
  } catch (e) {
    console.error("updateAccount failed", e);
  }
  revalidateMapping();
}
