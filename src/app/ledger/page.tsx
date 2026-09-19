import { Prisma, TxnStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import FilterBar from "./FilterBar";
import LedgerTable from "./LedgerTable";
import Pager from "./Pager";
import type { CategoryOption, LedgerRow } from "./types";

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
  const status = first(params.status);
  const q = first(params.q).trim();
  const includeHistorical = first(params.includeHistorical) === "1";
  const requestedPage = parseInt(first(params.page), 10);
  const page = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [accounts, categoriesRaw] = await Promise.all([
    prisma.account.findMany({ orderBy: { name: "asc" } }),
    prisma.category.findMany({
      where: { isActive: true },
      include: { expenseType: { include: { expenseNature: true } } },
    }),
  ]);

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
    orderBy: { txnDate: "desc" },
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

  // Query params to preserve across pagination links (everything but `page`).
  const baseParams = new URLSearchParams();
  if (from) baseParams.set("from", from);
  if (to) baseParams.set("to", to);
  if (accountId) baseParams.set("accountId", accountId);
  if (categoryId) baseParams.set("categoryId", categoryId);
  if (status) baseParams.set("status", status);
  if (q) baseParams.set("q", q);
  if (includeHistorical) baseParams.set("includeHistorical", "1");

  return (
    <div>
      <PageHeader
        title="Transaction Ledger"
        subtitle="Every transaction, filterable and inline-editable — the working table for day-to-day categorization."
      />

      <FilterBar
        accounts={accounts}
        categories={categories}
        values={{ from, to, accountId, categoryId, status, q, includeHistorical }}
      />

      <LedgerTable rows={rows} categories={categories} />

      <Pager page={clampedPage} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE} baseParams={baseParams} />
    </div>
  );
}
