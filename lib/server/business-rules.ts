import { DomainError } from "./platform/domain-error";

export type TaxInput = {
  taxType: "GST" | "NON_GST";
  taxRateBps: number;
};

export function calculateSubtotal(
  items: Array<{ quantity: number; unitPrice: number; discount: number }>,
  invoiceDiscount: number,
) {
  const grossAmount = items.reduce(
    (sum, item) => sum + item.quantity * item.unitPrice,
    0,
  );
  const discount =
    invoiceDiscount + items.reduce((sum, item) => sum + item.discount, 0);
  const subtotalAmount = grossAmount - discount;
  if (subtotalAmount <= 0)
    throw new DomainError(
      422,
      "Transaction total must be greater than zero.",
      "INVALID_TRANSACTION_TOTAL",
    );
  return { grossAmount, discount, subtotalAmount };
}

export function calculateInvoice(
  items: Array<{ quantity: number; unitPrice: number; discount: number }>,
  invoiceDiscount: number,
  tax: TaxInput = { taxType: "NON_GST", taxRateBps: 0 },
) {
  const subtotal = calculateSubtotal(items, invoiceDiscount);
  if (tax.taxType === "NON_GST" && tax.taxRateBps !== 0)
    throw new DomainError(
      422,
      "A non-GST invoice must have a zero tax rate.",
      "INVALID_TAX_RATE",
    );
  if (
    tax.taxType === "GST" &&
    (tax.taxRateBps <= 0 || tax.taxRateBps > 10_000)
  ) {
    throw new DomainError(
      422,
      "A GST invoice requires a tax rate between 0.01% and 100%.",
      "INVALID_TAX_RATE",
    );
  }
  const taxAmount =
    tax.taxType === "GST"
      ? Math.round((subtotal.subtotalAmount * tax.taxRateBps) / 10_000)
      : 0;
  return {
    grossAmount: subtotal.grossAmount,
    discount: subtotal.discount,
    taxableAmount: subtotal.subtotalAmount,
    taxAmount,
    netAmount: subtotal.subtotalAmount + taxAmount,
  };
}

/**
 * A distributor's onward resale (SECONDARY) is that distributor's revenue, not
 * the company's. It is tracked for visibility but must never enter the company
 * P&L or the company general ledger, or the same goods would be counted as
 * revenue twice.
 */
export function isCompanyFinancialSale(
  salesType: "PRIMARY" | "SECONDARY" | "DIRECT",
) {
  return salesType === "PRIMARY" || salesType === "DIRECT";
}
