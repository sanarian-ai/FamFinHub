-- CreateEnum
CREATE TYPE "RetirementBaselineGroup" AS ENUM ('spend', 'fixed', 'asset', 'income');
-- CreateEnum
CREATE TYPE "RetirementBaselineUnit" AS ENUM ('monthly', 'annual', 'lump');
-- CreateEnum
CREATE TYPE "RetirementEventKind" AS ENUM ('expense', 'inflow');
-- CreateTable
CREATE TABLE "retirement_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'household',
    "params" JSONB NOT NULL,
    "assumptions" JSONB NOT NULL,
    "driftThresholdPct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "retirement_plans_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "retirement_baseline_items" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" "RetirementBaselineGroup" NOT NULL,
    "unit" "RetirementBaselineUnit" NOT NULL,
    "valueL" DECIMAL(14,4) NOT NULL,
    "lastReviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "retirement_baseline_items_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "retirement_baseline_links" (
    "itemId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    CONSTRAINT "retirement_baseline_links_pkey" PRIMARY KEY ("itemId","categoryId")
);
-- CreateTable
CREATE TABLE "retirement_life_events" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "RetirementEventKind" NOT NULL,
    "amountL" DECIMAL(14,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "retirement_life_events_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "retirement_plan_versions" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "label" TEXT,
    "snapshot" JSONB NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "successPct" DECIMAL(5,2),
    "band" TEXT,
    "depletionYear" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "retirement_plan_versions_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "retirement_baseline_items_planId_key_key" ON "retirement_baseline_items"("planId", "key");
-- CreateIndex
CREATE INDEX "retirement_baseline_links_categoryId_idx" ON "retirement_baseline_links"("categoryId");
-- CreateIndex
CREATE INDEX "retirement_life_events_planId_year_idx" ON "retirement_life_events"("planId", "year");
-- CreateIndex
CREATE UNIQUE INDEX "retirement_plan_versions_planId_version_key" ON "retirement_plan_versions"("planId", "version");
-- AddForeignKey
ALTER TABLE "retirement_baseline_items" ADD CONSTRAINT "retirement_baseline_items_planId_fkey" FOREIGN KEY ("planId") REFERENCES "retirement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "retirement_baseline_links" ADD CONSTRAINT "retirement_baseline_links_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "retirement_baseline_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "retirement_baseline_links" ADD CONSTRAINT "retirement_baseline_links_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "retirement_life_events" ADD CONSTRAINT "retirement_life_events_planId_fkey" FOREIGN KEY ("planId") REFERENCES "retirement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "retirement_plan_versions" ADD CONSTRAINT "retirement_plan_versions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "retirement_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;
