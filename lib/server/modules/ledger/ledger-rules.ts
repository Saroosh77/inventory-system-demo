import type { PaymentMethod } from "@prisma/client";
import { ACCOUNT_CODES, type AccountCode } from "./chart-of-accounts";
import type { LedgerLineInput } from "./ledger-service";

/**
 * Pure functions that turn already-known amounts into journal lines — same
 * separation as business-rules.ts's calculateInvoice/calculateSubtotal.
 * No Prisma calls here, so these are trivial to unit test in isolation from
 * the services that call them.
 */

export function salesInvoiceLines(invoice: {
  netAmount: number;
  taxableAmount: number;
  taxAmount: number;
}): LedgerLineInput[] {
  const lines: LedgerLineInput[] = [
    { accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, debit: invoice.netAmount },
    { accountCode: ACCOUNT_CODES.SALES_REVENUE, credit: invoice.taxableAmount },
  ];
  if (invoice.taxAmount > 0) {
    lines.push({
      accountCode: ACCOUNT_CODES.GST_OUTPUT_PAYABLE,
      credit: invoice.taxAmount,
    });
  }
  return lines;
}

export function salesCogsLines(costOfGoodsSold: number): LedgerLineInput[] {
  if (costOfGoodsSold <= 0) return [];
  return [
    { accountCode: ACCOUNT_CODES.COGS, debit: costOfGoodsSold },
    { accountCode: ACCOUNT_CODES.INVENTORY, credit: costOfGoodsSold },
  ];
}

export function paymentAccountCode(method: PaymentMethod): AccountCode {
  switch (method) {
    case "CASH":
      return ACCOUNT_CODES.CASH;
    case "BANK":
    case "ONLINE":
      return ACCOUNT_CODES.BANK;
    case "CHEQUE":
      return ACCOUNT_CODES.CHEQUES_IN_HAND;
    case "ADJUSTMENT":
    case "OTHER":
      return ACCOUNT_CODES.SUSPENSE;
  }
}

export function customerPaymentLines(
  amount: number,
  method: PaymentMethod,
): LedgerLineInput[] {
  if (amount <= 0) return [];
  return [
    { accountCode: paymentAccountCode(method), debit: amount },
    { accountCode: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, credit: amount },
  ];
}

export function inventoryAdjustmentLines(
  direction: "IN" | "OUT",
  amount: number,
): LedgerLineInput[] {
  if (amount <= 0) return [];
  if (direction === "OUT") {
    return [
      { accountCode: ACCOUNT_CODES.INVENTORY_WRITE_OFF_EXPENSE, debit: amount },
      { accountCode: ACCOUNT_CODES.INVENTORY, credit: amount },
    ];
  }
  return [
    { accountCode: ACCOUNT_CODES.INVENTORY, debit: amount },
    { accountCode: ACCOUNT_CODES.OWNERS_EQUITY, credit: amount },
  ];
}
