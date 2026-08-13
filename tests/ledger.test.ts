import assert from "node:assert/strict";
import test from "node:test";
import type { Prisma } from "@prisma/client";
import { ACCOUNT_CODES } from "../lib/server/modules/ledger/chart-of-accounts";
import { postJournalEntry } from "../lib/server/modules/ledger/ledger-service";
import {
  customerPaymentLines,
  inventoryAdjustmentLines,
  paymentAccountCode,
  salesCogsLines,
  salesInvoiceLines,
} from "../lib/server/modules/ledger/ledger-rules";

function sumLines(lines: Array<{ debit?: number; credit?: number }>) {
  return {
    debit: lines.reduce((sum, line) => sum + (line.debit ?? 0), 0),
    credit: lines.reduce((sum, line) => sum + (line.credit ?? 0), 0),
  };
}

test("sales invoice lines balance and separate GST from revenue", () => {
  const lines = salesInvoiceLines({
    netAmount: 11_210,
    taxableAmount: 9_500,
    taxAmount: 1_710,
  });
  assert.deepEqual(sumLines(lines), { debit: 11_210, credit: 11_210 });
  assert.ok(lines.some((line) => line.accountCode === ACCOUNT_CODES.GST_OUTPUT_PAYABLE));
});

test("a zero-tax invoice omits the GST line", () => {
  const lines = salesInvoiceLines({ netAmount: 10_000, taxableAmount: 10_000, taxAmount: 0 });
  assert.equal(
    lines.some((line) => line.accountCode === ACCOUNT_CODES.GST_OUTPUT_PAYABLE),
    false,
  );
});

test("sales COGS lines balance, and a zero-cost invoice posts nothing", () => {
  assert.deepEqual(sumLines(salesCogsLines(6_000)), { debit: 6_000, credit: 6_000 });
  assert.deepEqual(salesCogsLines(0), []);
});

test("payment lines route by payment method and balance", () => {
  assert.equal(paymentAccountCode("CASH"), ACCOUNT_CODES.CASH);
  assert.equal(paymentAccountCode("ONLINE"), ACCOUNT_CODES.BANK);
  assert.equal(paymentAccountCode("CHEQUE"), ACCOUNT_CODES.CHEQUES_IN_HAND);
  assert.equal(paymentAccountCode("ADJUSTMENT"), ACCOUNT_CODES.SUSPENSE);
  assert.deepEqual(sumLines(customerPaymentLines(4_000, "BANK")), {
    debit: 4_000,
    credit: 4_000,
  });
});

test("inventory adjustment lines balance in both directions", () => {
  assert.deepEqual(sumLines(inventoryAdjustmentLines("OUT", 500)), { debit: 500, credit: 500 });
  assert.deepEqual(sumLines(inventoryAdjustmentLines("IN", 500)), { debit: 500, credit: 500 });
});

test("postJournalEntry rejects an imbalanced set of lines", async () => {
  const fakeTx = {
    account: {
      findMany: async () => [
        { id: "acc-ar", code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE },
        { id: "acc-rev", code: ACCOUNT_CODES.SALES_REVENUE },
      ],
    },
    counter: {
      upsert: async () => ({ value: 1 }),
    },
    journalEntry: {
      create: async () => {
        throw new Error("should never reach create for an imbalanced entry");
      },
    },
  } as unknown as Prisma.TransactionClient;

  await assert.rejects(
    () =>
      postJournalEntry(fakeTx, {
        actor: {
          id: "user-1",
          name: "Test Admin",
          email: "admin@test.local",
          role: "ADMIN",
          staffId: null,
          warehouseId: null,
        },
        entryDate: new Date("2026-08-09"),
        referenceType: "TEST",
        referenceId: "test-1",
        description: "imbalanced test entry",
        lines: [
          { accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, debit: 100 },
          { accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: 90 },
        ],
      }),
    /out of balance/i,
  );
});
