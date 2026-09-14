import { prisma } from "@/lib/prisma";
import { PageHeader, Card, Badge } from "@/components/ui";
import MappingTabs from "../MappingTabs";
import { updateAccount } from "../actions";

export const dynamic = "force-dynamic";

const ACCOUNT_KINDS = ["bank_debit", "credit_card", "cash", "wallet"] as const;

const KIND_TONE: Record<string, "slate" | "amber" | "emerald" | "rose" | "blue"> = {
  bank_debit: "blue",
  credit_card: "amber",
  cash: "emerald",
  wallet: "slate",
};

function AccountRow({ account }: { account: Awaited<ReturnType<typeof getAccounts>>[number] }) {
  return (
    <li className={`rounded-lg border border-slate-100 px-4 py-3 ${!account.isActive ? "opacity-60" : ""}`}>
      <details>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-900">{account.name}</span>
            <Badge tone={KIND_TONE[account.accountKind] ?? "slate"}>{account.accountKind}</Badge>
            <span className="text-xs text-slate-500">{account.holder}</span>
            {account.institution && <span className="text-xs text-slate-400">{account.institution}</span>}
          </div>
          {account.isActive ? <Badge tone="emerald">active</Badge> : <Badge tone="rose">inactive</Badge>}
        </summary>

        <form action={updateAccount} className="mt-3 flex flex-wrap items-end gap-3 rounded-md bg-slate-50 p-3">
          <input type="hidden" name="id" value={account.id} />
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Holder
            <select name="holder" defaultValue={account.holder} className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm">
              <option value="Sangeeth">Sangeeth</option>
              <option value="Ria">Ria</option>
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Account Kind
            <select
              name="accountKind"
              defaultValue={account.accountKind}
              className="mt-1 rounded-md border border-slate-300 px-2 py-1 text-sm"
            >
              {ACCOUNT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-xs font-medium text-slate-600">
            Institution
            <input
              name="institution"
              defaultValue={account.institution ?? ""}
              className="mt-1 w-32 rounded-md border border-slate-300 px-2 py-1 text-sm"
              placeholder="e.g. ICICI"
            />
          </label>
          <label className="flex items-center gap-1.5 pb-1 text-xs font-medium text-slate-600">
            <input type="checkbox" name="isActive" defaultChecked={account.isActive} />
            Active
          </label>
          <button type="submit" className="rounded-md bg-slate-900 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700">
            Save
          </button>
        </form>
      </details>
    </li>
  );
}

async function getAccounts() {
  return prisma.account.findMany({
    orderBy: [{ isActive: "desc" }, { holder: "asc" }, { name: "asc" }],
  });
}

export default async function MappingAccountsPage() {
  const accounts = await getAccounts();
  const active = accounts.filter((a) => a.isActive);
  const inactive = accounts.filter((a) => !a.isActive);

  return (
    <div>
      <PageHeader
        title="Mapping Admin"
        subtitle="Accounts feeding transactions in, across Sangeeth &amp; Ria's cards and banks."
      />
      <MappingTabs active="accounts" />

      <Card className="mb-6 p-0">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Active ({active.length})</h2>
        </div>
        <ul className="flex flex-col gap-2 p-4">
          {active.map((a) => (
            <AccountRow key={a.id} account={a} />
          ))}
        </ul>
      </Card>

      {inactive.length > 0 && (
        <Card className="p-0">
          <div className="border-b border-slate-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-900">Inactive / historical ({inactive.length})</h2>
          </div>
          <ul className="flex flex-col gap-2 p-4">
            {inactive.map((a) => (
              <AccountRow key={a.id} account={a} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
