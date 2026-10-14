import { prisma } from "@/lib/prisma";
import { getSpendReviewData } from "@/lib/spendReview/data";
import { SpendReview, type Initial } from "./SpendReview";

export const dynamic = "force-dynamic"; // always live off the current ledger

type SearchParams = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Deep-link params (used by the Dashboard / Insights links):
 *   person = Sangeeth | Ria | Household
 *   ptype  = month | year | fy, with month = YYYY-MM, or year = YYYY, or fy = YYYY (fiscal start year)
 */
export default async function SpendReviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const data = await getSpendReviewData(prisma);
  const initial: Initial = {};
  const person = one(sp.person);
  if (person === "Sangeeth") initial.person = "0";
  else if (person === "Ria") initial.person = "1";
  else if (person === "Household") initial.person = "all";
  const ptype = one(sp.ptype);
  if (ptype === "month") {
    const i = data.months.indexOf(one(sp.month) ?? "");
    if (i >= 0) { initial.ptype = "month"; initial.month = i; }
  } else if (ptype === "year" || ptype === "fy") {
    const y = Number(one(sp[ptype]));
    if (Number.isInteger(y) && y >= 2021 && y <= 2100) { initial.ptype = ptype; if (ptype === "year") initial.year = y; else initial.fy = y; }
  }
  return <SpendReview data={data} initial={initial} />;
}
