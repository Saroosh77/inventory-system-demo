import type { AccountType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, type Actor } from "@/lib/server/access-control";
import { DomainError } from "@/lib/server/platform/domain-error";
import { parseDateOnly } from "@/lib/server/platform/date";

export type TrialBalanceRow = {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  debit: number;
  credit: number;
};

export type TrialBalanceQuery = {
  asOf?: string;
};

/**
 * Debit and credit totals here are always structurally equal — every
 * journal entry that produced these lines was already balance-checked by
 * postJournalEntry before it could be written. The equality check is kept
 * anyway as a defensive assertion: this is literally the MVP contract's own
 * acceptance line ("Trial balance debit and credit totals are equal"), so
 * it should be visibly proven, not just implied.
 */
export async function trialBalance(actor: Actor, query: TrialBalanceQuery = {}) {
  assertPermission(actor, "VIEW_LEDGER");

  const asOf = query.asOf ? parseDateOnly(query.asOf) : undefined;

  const accounts = await prisma.account.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    include: {
      lines: {
        where: asOf ? { journalEntry: { entryDate: { lte: asOf } } } : undefined,
      },
    },
  });

  const rows: TrialBalanceRow[] = accounts.map((account) => ({
    accountId: account.id,
    code: account.code,
    name: account.name,
    type: account.type,
    debit: account.lines.reduce((sum, line) => sum + line.debit, 0),
    credit: account.lines.reduce((sum, line) => sum + line.credit, 0),
  }));

  const totalDebit = rows.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = rows.reduce((sum, row) => sum + row.credit, 0);

  if (totalDebit !== totalCredit) {
    throw new DomainError(
      500,
      `Trial balance is out of balance: debit ${totalDebit} vs credit ${totalCredit}.`,
      "LEDGER_IMBALANCE",
    );
  }

  return { rows, totalDebit, totalCredit };
}

function accountBalance(row: TrialBalanceRow): number {
  return row.type === "ASSET" || row.type === "EXPENSE"
    ? row.debit - row.credit
    : row.credit - row.debit;
}

export type BalanceSheetQuery = { asOf?: string };

export type BalanceSheetSection = { rows: TrialBalanceRow[]; total: number };

export type BalanceSheet = {
  asOf: string | null;
  assets: BalanceSheetSection;
  liabilities: BalanceSheetSection;
  equity: BalanceSheetSection;
  currentPeriodEarnings: number;
  totalLiabilitiesAndEquity: number;
};

/**
 * Buckets trial-balance rows by account type and folds Revenue−Expense for
 * the period into equity as an unposted "current period earnings" line, so
 * Assets = Liabilities + Equity holds at any date without a formal
 * period-close job moving P&L into Retained Earnings. A real period-close
 * is a v2 addition — see the ledger plan.
 *
 * This identity isn't asserted separately: it falls straight out of the
 * trial balance's own debit=credit identity (which trialBalance already
 * checks) once revenue/expense balances are netted into equity, algebraically:
 *   Σassets − Σliabilities − Σequity = Σrevenue − Σexpense
 */
export async function balanceSheet(
  actor: Actor,
  query: BalanceSheetQuery = {},
): Promise<BalanceSheet> {
  const { rows } = await trialBalance(actor, query);

  const byType = (type: AccountType) => rows.filter((row) => row.type === type);
  const sum = (list: TrialBalanceRow[]) =>
    list.reduce((total, row) => total + accountBalance(row), 0);

  const assets = byType("ASSET");
  const liabilities = byType("LIABILITY");
  const equity = byType("EQUITY");
  const currentPeriodEarnings = sum(byType("REVENUE")) - sum(byType("EXPENSE"));

  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity) + currentPeriodEarnings;

  return {
    asOf: query.asOf ?? null,
    assets: { rows: assets, total: totalAssets },
    liabilities: { rows: liabilities, total: totalLiabilities },
    equity: { rows: equity, total: totalEquity },
    currentPeriodEarnings,
    totalLiabilitiesAndEquity: totalLiabilities + totalEquity,
  };
}
