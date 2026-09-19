import Link from "next/link";
import { Badge, Card, PageHeader, StatTile } from "@/components/ui";
import { formatDate, formatINR, pctChange } from "@/lib/format";
import {
  getEffectiveNow,
  getExpenditureRows,
  getIncomeRows,
  getNeedsReviewCount,
  getCashFlowSummary,
  getCashFlowRows,
  getAccountTypeRows,
  getHolderSplit,
  getUnattributedTotal,
  getLastImportSync,
} from "./dashboard-parts/queries";
import {
  getPeriod,
  monthRange,
  monthShortLabel,
  previousPeriod,
  samePeriodLastYear,
  trailingMonths,
  type PeriodKind,
  type YearView,
  type PersonView,
  type Holder,
} from "./dashboard-parts/period";
import { sumByAccount, sumByNature, sumByAccountType, topMovers, bucketCashFlowByMonth } from "./dashboard-parts/aggregate";
import { PeriodSelector } from "./dashboard-parts/PeriodSelector";
import { PersonSelector } from "./dashboard-parts/PersonSelector";
import { type CashFlowDatum } from "./dashboard-parts/CashFlowTrendChart";
import { CashFlowSection } from "./dashboard-parts/CashFlowSection";
import { AccountSplit } from "./dashboard-parts/AccountSplit";
import { TopMovers } from "./dashboard-parts/TopMovers";
import { ContributionSplitBars } from "./dashboard-parts/ContributionSplitBars";
import { HouseholdSplit } from "./dashboard-parts/HouseholdSplit";
import { DataQualityStrip } from "./dashboard-parts/DataQualityStrip";

export const dynamic = "force-dynamic"; // always reflect the live database

type SearchParams = { [key: string]: string | string[] | undefined };

function parsePerson(v: unknown): PersonView {
  return v === "Sangeeth" || v === "Ria" ? v : "household";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const periodParam = typeof params.period === "string" ? params.period : "month";
  const viewParam = typeof params.view === "string" ? params.view : "cal";
  const kind: PeriodKind = periodParam === "year" ? "year" : "month";
  const view: YearView = viewParam === "fy" ? "fy" : "cal";
  const person = parsePerson(params.person);
  const holder: Holder | undefined = person === "household" ? undefined : person;

  const effectiveNow = await getEffectiveNow();

  const current = getPeriod(kind, view, effectiveNow);
  const prevPeriod = previousPeriod(kind, view, current);
  const sameLastYear = samePeriodLastYear(kind, view, current);

  // Top movers and the trend chart are always "trailing months" concepts,
  // independent of the period-length toggle above.
  const currentMonth = monthRange(effectiveNow);
  const prevMonth = previousPeriod("month", "cal", currentMonth);
  const months = trailingMonths(effectiveNow, 12);
  const trailingStart = months[0].start;
  const trailingEnd = months[months.length - 1].end;

  const [
    cashFlowCurrent,
    cashFlowPrev,
    cashFlowSameLastYear,
    needsReviewCount,
    unattributedTotal,
    lastSync,
    currentExpenditureRows,
    trailingCashFlowRows,
    trailingExpenditureRows,
    trailingIncomeRows,
    trailingAccountTypeRows,
    moverCurrentRows,
    moverPrevRows,
    accountTypeRows,
    holderSplit,
    sangeethAccountRows,
    riaAccountRows,
  ] = await Promise.all([
    getCashFlowSummary(current.start, current.end, holder),
    getCashFlowSummary(prevPeriod.start, prevPeriod.end, holder),
    getCashFlowSummary(sameLastYear.start, sameLastYear.end, holder),
    getNeedsReviewCount(),
    getUnattributedTotal(),
    getLastImportSync(),
    getExpenditureRows(current.start, current.end, holder),
    getCashFlowRows(trailingStart, trailingEnd, holder),
    getExpenditureRows(trailingStart, trailingEnd, holder),
    getIncomeRows(trailingStart, trailingEnd, holder),
    getAccountTypeRows(trailingStart, trailingEnd, holder),
    getExpenditureRows(currentMonth.start, currentMonth.end, holder),
    getExpenditureRows(prevMonth.start, prevMonth.end, holder),
    getAccountTypeRows(current.start, current.end, holder),
    person === "household" ? getHolderSplit(current.start, current.end) : Promise.resolve(null),
    person === "household" ? getExpenditureRows(current.start, current.end, "Sangeeth") : Promise.resolve([]),
    person === "household" ? getExpenditureRows(current.start, current.end, "Ria") : Promise.resolve([]),
  ]);

  const natureTotals = sumByNature(currentExpenditureRows);
  const spendOnlyTotal = currentExpenditureRows.reduce((s, r) => s + r.amount, 0);
  const accountTotals = sumByAccount(currentExpenditureRows);
  const accountTypeTotals = sumByAccountType(accountTypeRows);
  const accountTypeGrandTotal = accountTypeTotals.reduce((s, d) => s + d.total, 0);
  const movers = topMovers(moverCurrentRows, moverPrevRows, 5);

  const monthLabels = months.map((m) => monthShortLabel(m.start));
  const cashFlowBuckets = bucketCashFlowByMonth(trailingCashFlowRows.income, trailingCashFlowRows.expense, months);
  const cashFlowTrendData: CashFlowDatum[] = cashFlowBuckets.map((b, i) => ({
    month: monthLabels[i],
    income: b.income,
    expense: b.expense,
    net: b.net,
  }));

  const accountsByHolder: Record<string, ReturnType<typeof sumByAccount>> =
    person === "household"
      ? { Sangeeth: sumByAccount(sangeethAccountRows), Ria: sumByAccount(riaAccountRows) }
      : {};

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`As of ${formatDate(effectiveNow)} — ${current.label}${person !== "household" ? ` — ${person}` : ""}`}
        actions={
          <div className="flex flex-col items-end gap-2">
            <PeriodSelector kind={kind} view={view} />
            <PersonSelector kind={kind} view={view} person={person} />
          </div>
        }
      />

      {needsReviewCount > 0 && (
        <Link href="/review" className="mb-4 block">
          <Card className="flex items-center justify-between gap-4 border-amber-200 bg-amber-50 hover:bg-amber-100">
            <div className="flex items-center gap-3">
              <span className="text-xl" aria-hidden>
                ⚠️
              </span>
              <div>
                <div className="text-sm font-semibold text-amber-900">
                  {needsReviewCount} transaction{needsReviewCount === 1 ? "" : "s"} need
                  {needsReviewCount === 1 ? "s" : ""} categorization
                </div>
                <div className="text-xs text-amber-700">Head to the Review Queue to clear them out.</div>
              </div>
            </div>
            <Badge tone="amber">Review now →</Badge>
          </Card>
        </Link>
      )}

      <div className="mb-6">
        <DataQualityStrip needsReviewCount={needsReviewCount} unattributedTotal={unattributedTotal} lastSync={lastSync} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={`Income — ${current.label}`}
          value={formatINR(cashFlowCurrent.income)}
          delta={pctChange(cashFlowCurrent.income, cashFlowPrev.income)}
          deltaLabel="vs last period"
          delta2={pctChange(cashFlowCurrent.income, cashFlowSameLastYear.income)}
          deltaLabel2="vs last year"
          positiveIsBad={false}
        />
        <StatTile
          label={`Expense — ${current.label}`}
          value={formatINR(cashFlowCurrent.expense)}
          delta={pctChange(cashFlowCurrent.expense, cashFlowPrev.expense)}
          deltaLabel="vs last period"
          delta2={pctChange(cashFlowCurrent.expense, cashFlowSameLastYear.expense)}
          deltaLabel2="vs last year"
          positiveIsBad={true}
        />
        <StatTile
          label="Net"
          value={formatINR(cashFlowCurrent.net)}
          delta={pctChange(cashFlowCurrent.net, cashFlowPrev.net)}
          deltaLabel="vs last period"
          delta2={pctChange(cashFlowCurrent.net, cashFlowSameLastYear.net)}
          deltaLabel2="vs last year"
          positiveIsBad={false}
        />
        <StatTile
          label="Savings rate"
          value={cashFlowCurrent.savingsRate != null ? `${cashFlowCurrent.savingsRate.toFixed(0)}%` : "—"}
          delta={
            cashFlowCurrent.savingsRate != null && cashFlowPrev.savingsRate != null
              ? cashFlowCurrent.savingsRate - cashFlowPrev.savingsRate
              : null
          }
          deltaLabel="pts vs last period"
          positiveIsBad={false}
        />
      </div>

      {person === "household" && holderSplit && (
        <div className="mb-6">
          <ContributionSplitBars holders={holderSplit} />
        </div>
      )}

      <CashFlowSection
        months={months}
        cashFlowTrendData={cashFlowTrendData}
        trailingExpenditureRows={trailingExpenditureRows}
        trailingIncomeRows={trailingIncomeRows}
        trailingAccountTypeRows={trailingAccountTypeRows}
        topNatureData={natureTotals}
        topNatureTotal={spendOnlyTotal}
        topAccountTypeData={accountTypeTotals}
        topAccountTypeTotal={accountTypeGrandTotal}
        topPeriodLabel={current.label}
      />

      {person === "household" && holderSplit && (
        <div className="mb-6">
          <HouseholdSplit holders={holderSplit} accountsByHolder={accountsByHolder} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className={person === "household" ? "lg:col-span-2" : undefined}>
          <h2 className="mb-1 text-sm font-semibold text-slate-900">Top movers</h2>
          <p className="mb-2 text-xs text-slate-400">
            Categories with the largest change, {monthShortLabel(prevMonth.start)} → {monthShortLabel(currentMonth.start)}
          </p>
          <TopMovers movers={movers} />
        </Card>
        {person !== "household" && (
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-slate-900">Spend by account — {current.label}</h2>
            <p className="mb-4 text-xs text-slate-400">{person}&rsquo;s active accounts.</p>
            <AccountSplit accounts={accountTotals} />
          </Card>
        )}
      </div>
    </div>
  );
}
