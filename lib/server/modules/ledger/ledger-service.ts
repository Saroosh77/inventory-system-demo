import { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/server/access-control";
import { DomainError } from "@/lib/server/platform/domain-error";
import { nextDocumentNumber } from "@/lib/server/platform/number-service";
import type { AccountCode } from "./chart-of-accounts";

export type LedgerLineInput = {
  accountCode: AccountCode;
  debit?: number;
  credit?: number;
};

type ResolvedLine = {
  accountId: string;
  debit: number;
  credit: number;
};

function validateLines(lines: Array<{ debit: number; credit: number }>) {
  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new DomainError(
        500,
        "Journal line amounts cannot be negative.",
        "LEDGER_IMBALANCE",
      );
    }
    if (line.debit !== 0 && line.credit !== 0) {
      throw new DomainError(
        500,
        "A journal line cannot carry both a debit and a credit.",
        "LEDGER_IMBALANCE",
      );
    }
  }

  const totalDebit = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = lines.reduce((sum, line) => sum + line.credit, 0);
  if (totalDebit !== totalCredit) {
    throw new DomainError(
      500,
      `Journal entry is out of balance: debit ${totalDebit} vs credit ${totalCredit}.`,
      "LEDGER_IMBALANCE",
    );
  }
}

async function insertJournalEntry(
  tx: Prisma.TransactionClient,
  input: {
    actor: Actor;
    entryDate: Date;
    referenceType: string;
    referenceId: string;
    description: string;
    lines: ResolvedLine[];
  },
) {
  const lines = input.lines.filter(
    (line) => line.debit !== 0 || line.credit !== 0,
  );
  if (lines.length === 0) return null;

  validateLines(lines);

  const entryNumber = await nextDocumentNumber(
    tx,
    "journal-entry",
    "JE",
    input.entryDate,
  );

  return tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: input.entryDate,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      description: input.description,
      createdById: input.actor.id,
      lines: {
        create: lines.map((line) => ({
          accountId: line.accountId,
          debit: line.debit,
          credit: line.credit,
        })),
      },
    },
    include: { lines: true },
  });
}

/**
 * Posts a balanced journal entry inside the caller's own transaction —
 * mirrors how receiveStock/consumeStock ride inside the calling service's
 * transaction in stock-ledger.ts, rather than opening a transaction of its
 * own. Lines with a zero amount are dropped (e.g. a zero-tax invoice simply
 * has no GST line); if every line drops out, nothing is posted.
 *
 * An imbalanced or malformed set of lines throws LEDGER_IMBALANCE. This
 * should be unreachable in normal operation — it means a caller in
 * ledger-rules.ts built its lines wrong, not that a user did something
 * invalid.
 */
export async function postJournalEntry(
  tx: Prisma.TransactionClient,
  input: {
    actor: Actor;
    entryDate: Date;
    referenceType: string;
    referenceId: string;
    description: string;
    lines: LedgerLineInput[];
  },
) {
  const codes = [...new Set(input.lines.map((line) => line.accountCode))];
  const accounts = await tx.account.findMany({
    where: { code: { in: codes } },
  });
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));

  const resolved: ResolvedLine[] = input.lines.map((line) => {
    const account = accountByCode.get(line.accountCode);
    if (!account) {
      throw new DomainError(
        500,
        `Unknown ledger account code "${line.accountCode}".`,
        "LEDGER_IMBALANCE",
      );
    }
    return {
      accountId: account.id,
      debit: line.debit ?? 0,
      credit: line.credit ?? 0,
    };
  });

  return insertJournalEntry(tx, { ...input, lines: resolved });
}

/**
 * Reverses whatever journal entry was posted against
 * (originalReferenceType, originalReferenceId), by swapping every line's
 * debit and credit into a new entry. Returns null — rather than throwing —
 * when no such entry exists, so cancelling a document created before the
 * ledger existed degrades gracefully instead of blocking the cancellation.
 */
export async function reverseJournalEntry(
  tx: Prisma.TransactionClient,
  input: {
    actor: Actor;
    entryDate: Date;
    originalReferenceType: string;
    originalReferenceId: string;
    newReferenceType: string;
    newReferenceId: string;
    description: string;
  },
) {
  const original = await tx.journalEntry.findFirst({
    where: {
      referenceType: input.originalReferenceType,
      referenceId: input.originalReferenceId,
    },
    include: { lines: true },
  });
  if (!original) return null;

  return insertJournalEntry(tx, {
    actor: input.actor,
    entryDate: input.entryDate,
    referenceType: input.newReferenceType,
    referenceId: input.newReferenceId,
    description: input.description,
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,
      credit: line.debit,
    })),
  });
}
