import type { AccountType } from "@prisma/client";

/**
 * Canonical chart of accounts. prisma/seed.ts creates the rows from this
 * list; the rest of the ledger module codes against these constants instead
 * of magic account-code strings.
 */
export const ACCOUNT_CODES = {
  CASH: "1000",
  BANK: "1010",
  CHEQUES_IN_HAND: "1020",
  SUSPENSE: "1030",
  ACCOUNTS_RECEIVABLE: "1100",
  INVENTORY: "1200",
  GST_INPUT_RECOVERABLE: "1300",
  ACCOUNTS_PAYABLE: "2000",
  GST_OUTPUT_PAYABLE: "2100",
  OWNERS_EQUITY: "3000",
  RETAINED_EARNINGS: "3100",
  SALES_REVENUE: "4000",
  COGS: "5000",
  INVENTORY_WRITE_OFF_EXPENSE: "5200",
} as const;

export type AccountCode = (typeof ACCOUNT_CODES)[keyof typeof ACCOUNT_CODES];

export const CHART_OF_ACCOUNTS: Array<{
  code: AccountCode;
  name: string;
  type: AccountType;
}> = [
  { code: ACCOUNT_CODES.CASH, name: "Cash", type: "ASSET" },
  { code: ACCOUNT_CODES.BANK, name: "Bank", type: "ASSET" },
  { code: ACCOUNT_CODES.CHEQUES_IN_HAND, name: "Cheques in Hand", type: "ASSET" },
  {
    code: ACCOUNT_CODES.SUSPENSE,
    name: "Suspense (Other Payment Methods)",
    type: "ASSET",
  },
  {
    code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE,
    name: "Accounts Receivable",
    type: "ASSET",
  },
  { code: ACCOUNT_CODES.INVENTORY, name: "Inventory", type: "ASSET" },
  {
    code: ACCOUNT_CODES.GST_INPUT_RECOVERABLE,
    name: "GST Input Recoverable",
    type: "ASSET",
  },
  {
    code: ACCOUNT_CODES.ACCOUNTS_PAYABLE,
    name: "Accounts Payable",
    type: "LIABILITY",
  },
  {
    code: ACCOUNT_CODES.GST_OUTPUT_PAYABLE,
    name: "GST Output Payable",
    type: "LIABILITY",
  },
  { code: ACCOUNT_CODES.OWNERS_EQUITY, name: "Owner's Equity", type: "EQUITY" },
  { code: ACCOUNT_CODES.RETAINED_EARNINGS, name: "Retained Earnings", type: "EQUITY" },
  { code: ACCOUNT_CODES.SALES_REVENUE, name: "Sales Revenue", type: "REVENUE" },
  { code: ACCOUNT_CODES.COGS, name: "Cost of Goods Sold", type: "EXPENSE" },
  {
    code: ACCOUNT_CODES.INVENTORY_WRITE_OFF_EXPENSE,
    name: "Inventory Write-off Expense",
    type: "EXPENSE",
  },
];

export function normalBalance(type: AccountType): "DEBIT" | "CREDIT" {
  return type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT";
}
