export type CategoryOption = {
  id: string;
  name: string;
  expenseTypeName: string;
  natureName: string;
};

export type LedgerRow = {
  id: string;
  txnDate: string; // ISO string
  rawDescription: string;
  amount: number; // signed, negative = outflow
  currency: string;
  accountId: string | null;
  accountName: string | null;
  accountHolder: string | null;
  categoryId: string | null;
  categoryName: string | null;
  status: "categorized" | "needs_review";
  source: string;
};
