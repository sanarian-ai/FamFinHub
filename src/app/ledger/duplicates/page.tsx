import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui";
import { findDuplicateClusters } from "@/lib/dedupeReview";
import DuplicatesReview from "./DuplicatesReview";

export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const clusters = await findDuplicateClusters(prisma);
  return (
    <div>
      <PageHeader
        title="Review possible duplicates"
        subtitle="Transactions sharing a date, amount and account that look like the same real transaction entered more than once. Nothing is deleted until you tick rows and confirm."
        actions={
          <a href="/ledger" className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            ← Back to ledger
          </a>
        }
      />
      <DuplicatesReview clusters={clusters} />
    </div>
  );
}
