import { prisma } from "@/lib/prisma";
import { getSpendReviewData } from "@/lib/spendReview/data";
import { SpendReview } from "./SpendReview";

export const dynamic = "force-dynamic"; // always live off the current ledger

export default async function SpendReviewPage() {
  const data = await getSpendReviewData(prisma);
  return <SpendReview data={data} />;
}
