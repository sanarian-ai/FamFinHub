// Loads the JSON produced by build_seed_json.py into the Prisma/SQLite dev DB.
// Run with: node prisma/seed-data/seed.js
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const DIR = __dirname;

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function main() {
  const mapping = JSON.parse(fs.readFileSync(path.join(DIR, "mapping.json"), "utf8"));
  const accounts = JSON.parse(fs.readFileSync(path.join(DIR, "accounts.json"), "utf8"));
  const transactions = JSON.parse(fs.readFileSync(path.join(DIR, "transactions.json"), "utf8"));

  console.log("Clearing existing data (idempotent re-seed)...");
  await prisma.transaction.deleteMany({});
  await prisma.importBatch.deleteMany({});
  await prisma.categoryRule.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.expenseType.deleteMany({});
  await prisma.expenseNature.deleteMany({});
  await prisma.account.deleteMany({});

  console.log("Seeding expense natures:", mapping.natures.length);
  const natureIdByName = {};
  for (const n of mapping.natures) {
    const rec = await prisma.expenseNature.create({
      data: { name: n.name, accountType: n.accountType },
    });
    natureIdByName[n.name] = rec.id;
  }

  console.log("Seeding expense types:", mapping.types.length);
  const typeIdByKey = {}; // key = `${typeName}::${natureName}`
  for (const t of mapping.types) {
    const natureId = natureIdByName[t.natureName];
    if (!natureId) continue;
    const rec = await prisma.expenseType.create({
      data: { name: t.name, expenseNatureId: natureId },
    });
    typeIdByKey[`${t.name}::${t.natureName}`] = rec.id;
  }

  console.log("Seeding categories:", mapping.categories.length);
  const categoryIdByName = {};
  for (const c of mapping.categories) {
    const typeId = typeIdByKey[`${c.expenseType}::${c.expenseNature}`];
    if (!typeId) {
      console.warn("  skip category, no type match:", c.name, c.expenseType, c.expenseNature);
      continue;
    }
    const rec = await prisma.category.create({
      data: { name: c.name, expenseTypeId: typeId },
    });
    categoryIdByName[c.name] = rec.id;
  }

  console.log("Seeding accounts:", accounts.length);
  const accountIdByName = {};
  for (const a of accounts) {
    const rec = await prisma.account.create({
      data: {
        name: a.name,
        holder: a.holder,
        institution: a.institution,
        accountKind: a.kind,
        isActive: a.active,
      },
    });
    accountIdByName[a.name] = rec.id;
  }

  const batch = await prisma.importBatch.create({
    data: {
      source: "migration",
      status: "running",
      rowsIn: transactions.length,
    },
  });

  console.log("Seeding transactions:", transactions.length);
  let matched = 0, needsReview = 0, skipped = 0;
  const rows = [];
  for (const t of transactions) {
    const categoryId = t.categoryName ? categoryIdByName[t.categoryName] : null;
    const accountId = t.accountName ? accountIdByName[t.accountName] : null;
    if (t.categoryName && !categoryId) {
      // category name existed in mapping.json but failed to resolve to an id -- shouldn't happen, but don't drop the row
      console.warn("  unresolved category id for", t.categoryName);
    }
    if (t.status === "categorized" && categoryId) matched++;
    else needsReview++;

    rows.push({
      txnDate: new Date(t.txnDate),
      rawDescription: t.rawDescription,
      amount: t.amount,
      categoryId: categoryId || null,
      accountId: accountId || null,
      status: categoryId ? "categorized" : "needs_review",
      source: "migration",
      importBatchId: batch.id,
      dedupeHash: t.dedupeHash,
      suggestionReason: t.suggestionReason || null,
      legacyCalYear: t.legacyCalYear || null,
      legacyFyYear: t.legacyFyYear || null,
    });
  }

  for (const c of chunk(rows, 500)) {
    await prisma.transaction.createMany({ data: c });
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: "completed",
      finishedAt: new Date(),
      rowsMatched: matched,
      rowsNeedsReview: needsReview,
    },
  });

  console.log("Mining category_rules from historical exact-description patterns...");
  const categorized = await prisma.transaction.findMany({
    where: { status: "categorized", categoryId: { not: null } },
    select: { rawDescription: true, categoryId: true },
  });
  const byDesc = new Map(); // normalizedDesc -> Map<categoryId, count>
  for (const t of categorized) {
    const key = t.rawDescription.trim().toLowerCase().replace(/\s+/g, " ");
    if (!key) continue;
    if (!byDesc.has(key)) byDesc.set(key, new Map());
    const m = byDesc.get(key);
    m.set(t.categoryId, (m.get(t.categoryId) || 0) + 1);
  }
  let rulesCreated = 0;
  for (const [desc, catCounts] of byDesc.entries()) {
    const total = [...catCounts.values()].reduce((a, b) => a + b, 0);
    if (total < 3) continue; // needs to have repeated at least 3x historically to be worth a rule
    const [topCatId, topCount] = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (topCount / total < 0.9) continue; // must be overwhelmingly consistent, not just plurality
    await prisma.categoryRule.create({
      data: {
        matchType: "exact",
        pattern: desc,
        categoryId: topCatId,
        priority: 100,
        source: "seeded_from_history",
      },
    });
    rulesCreated++;
  }
  console.log("category_rules created from history:", rulesCreated);

  const countTxns = await prisma.transaction.count();
  const sum = await prisma.transaction.aggregate({ _sum: { amount: true } });
  console.log("---- Migration summary ----");
  console.log("transactions inserted:", countTxns, "(expected", transactions.length, ")");
  console.log("matched/categorized:", matched, " needs_review:", needsReview);
  console.log("sum of amounts in DB:", sum._sum.amount?.toString());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
