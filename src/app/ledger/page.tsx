import { Prisma, TxnStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import FilterBar from "./FilterBar";
import LedgerTable from "./LedgerTable";
import Pager from "./Pager";
import type { CategoryOption, LedgerRow, NatureOption } from "./types";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 75;

type SearchParams = { [key: string]: string | string[] | undefined };

function first(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default async function LedgerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const from = first(params.from);
  const to = first(params.to);
  const accountId = first(params.accountId);
  const categoryId = first(params.categoryId);
  const natureId = first(params.natureId);
  const accountTypeRaw = first(params.accountType);
  const status = first(params.status);
  const q = first(params.q).trim();
  const includeHistorical = first(params.includeHistorical) === "1";
  const requestedPage = parseInt(first(params.page), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  // Same level as natureId (one above Category, filters everything under an Account Type —
  // Expenditure/Investment/Income/Transfer — rather than one Nature) — the destination for the
  // Dashboard's Account Type bars, which previously had no Ledger link at all.
  const VALID_ACCOUNT_TYPES = ["Expenditure", "Investment", "Income", "Transfer"] as const;
  const accountType = (VALID_ACCOUNT_TYPES as readonly string[]).includes(accountTypeRaw)
    ? (accountTypeRaw as (typeof VALID_ACCOUNT_TYPES)[number])
    : "";

  // Header-click sorting. `sort` picks which column, `dir` which direction; both are validated
  // against a fixed allow-list rather than trusted from the query string, since an invalid value
  // would otherwise reach Prisma's orderBy directly.
  const SORT_KEYS = ["date", "effectiveMonth", "description", "amount", "account", "category", "status", "source"] as const;
  type SortKey = (typeof SORT_KEYS)[number];
  const sortRaw = first(params.sort);
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sortRaw) ? (sortRaw as SortKey) : "date";
  const dir: Prisma.SortOrder = first(params.dir) === "asc" ? "asc" : "desc";

  function orderByFor(key: SortKey, direction: Prisma.SortOrder): Prisma.TransactionOrderByWithRelationInput {
    switch (key) {
      case "date":
        return { txnDate: direction };
      case "effectiveMonth":
        return { effectiveMonth: direction };
      case "description":
        return { rawDescription: direction };
      case "amount":
        return { amount: direction };
      case "account":
        return { account: { name: direction } };
      case "category":
        return { category: { name: direction } };
      case "status":
        return { status: direction };
      case "source":
        return { source: direction };
    }
  }

  const [accounts, categoriesRaw, naturesRaw] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({
      where: { isActive: true },
      include: { expenseType: { include: { expenseNature: true } } },
    }),
    prisma.expenseNature.findMany({
      where: { isActive: true },
      orderBy: [{ accountType: "asc" }, { name: "asc" }],
    }),
  ]);

  const natures: NatureOption[] = naturesRaw.map((n) => ({ id: n.id, name: n.name, accountType: n.accountType }));

  const categories: CategoryOption[] = categoriesRaw
    .map((c) => ({
      id: c.id,
      name: c.name,
      expenseTypeName: c.expenseType.name,
      natureName: c.expenseType.expenseNature.name,
    }))
    .sort(
      (a, b) =>
        a.natureName.localeCompare(b.natureName) ||
        a.expenseTypeName.localeCompare(b.expenseTypeName) ||
        a.name.localeCompare(b.name)
    );

  const activeAccountIds = accounts.filter((a) => a.isActive).map((a) => a.id);

  const where: Prisma.TransactionWhereInput = {};

  if (from || to) {
    where.txnDate = {};
    if (from) where.txnDate.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) where.txnDate.lte = new Date(`${to}T23:59:59.999Z`);
  }

  if (accountId) {
    where.accountId = accountId;
  } else if (!includeHistorical) {
    // Default view: transactions on currently-active accounts, plus any
    // transaction that was never linked to an account at all.
    where.OR = [{ accountId: { in: activeAccountIds } }, { accountId: null }];
  }

  if (categoryId) {
    where.categoryId = categoryId;
  }

  // Independent of categoryId above — narrows by the parent Nature (e.g. "Household Fixed")
  // rather than one leaf Category, so it can be combined with categoryId (redundant but
  // harmless) or used alone to see everything under a nature. Also the destination for the
  // Dashboard's Nature donut/legend links (see NatureDonut.tsx), which previously pointed at a
  // `nature=` param this page never read — fixed to use natureId consistently with accountId /
  // categoryId's naming.
  if (natureId || accountType) {
    where.category = {
      expenseType: {
        expenseNature: {
          ...(natureId ? { id: natureId } : {}),
          ...(accountType ? { accountType } : {}),
        },
      },
    };
  }

  if (status === "categorized" || status === "needs_review") {
    where.status = status as TxnStatus;
  }

  if (q) {
    // Postgres' `contains` is case-sensitive by default (unlike SQLite's default LIKE), so a
    // search like "swiggy" would silently miss "SWIGGY INSTAMART" without this — explicit
    // `mode: "insensitive"` (a Postgres/Mongo-only Prisma option) is required here.
    where.rawDescription = { contains: q, mode: "insensitive" };
  }

  const totalCount = await prisma.transaction.count({ where });
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const clampedPage = Math.min(page, totalPages);

  const transactions = await prisma.transaction.findMany({
    where,
    include: { category: true, account: true },
    orderBy: orderByFor(sort, dir),
    skip: (clampedPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const rows: LedgerRow[] = transactions.map((t) => ({
    id: t.id,
    txnDate: t.txnDate.toISOString(),
    effectiveMonth: t.effectiveMonth ? t.effectiveMonth.toISOString() : null,
    rawDescription: t.rawDescription,
    amount: Number(t.amount),
    currency: t.currency,
    accountId: t.accountId,
    accountName: t.account?.name ?? null,
    accountHolder: t.account?.holder ?? null,
    categoryId: t.categoryId,
    categoryName: t.category?.name ?? null,
    status: t.status,
    source: t.source,
  }));

  // Filters only — everything but `page` and the current sort — so header-sort links can
  // start from a clean base and set their own sort/dir, independent of however the page is
  // currently sorted.
  const filterParams = new URLSearchParams();
  if (from) filterParams.set("from", from);
  if (to) filterParams.set("to", to);
  if (accountId) filterParams.set("accountId", accountId);
  if (categoryId) filterParams.set("categoryId", categoryId);
  if (natureId) filterParams.set("natureId", natureId);
  if (accountType) filterParams.set("accountType", accountType);
  if (status) filterParams.set("status", status);
  if (q) filterParams.set("q", q);
  if (includeHistorical) filterParams.set("includeHistorical", "1");

  // Filters + current sort — preserved across pagination links (everything but `page`).
  const baseParams = new URLSearchParams(filterParams);
  if (sort !== "date") baseParams.set("sort", sort);
  if (dir !== "desc") baseParams.set("dir", dir);

  return (
    <div>
      <PageHeader
        title="Transaction Ledger"
        subtitle="Every transaction, filterable and inline-editable — the working table for day-to-day categorization."
      />

      <FilterBar
        accounts={accounts}
        categories={categories}
        natures={natures}
        values={{ from, to, accountId, categoryId, natureId, status, q, includeHistorical }}
      />

      <LedgerTable
        rows={rows}
        categories={categories}
        filterQueryString={filterParams.toString()}
        sort={sort}
        dir={dir}
      />

      <Pager page={clampedPage} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE} baseParams={baseParams} />
    </div>
  );
}
