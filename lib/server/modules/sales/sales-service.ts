import { assertPermission, type Actor } from "../../access-control";
import { DomainError } from "@/lib/server/platform/domain-error";
import { withSerializableRetry } from "@/lib/server/platform/transaction";
import { receiveStock } from "../inventory/stock-ledger";
import { writeAudit } from "@/lib/server/platform/audit-service";
import { reverseJournalEntry } from "../ledger/ledger-service";

/**
 * Reverses a posted invoice.
 *
 * Nothing is deleted. The receivable is zeroed, the invoice moves to
 * CANCELLED, and any stock that physically left the warehouse against it is
 * put back with a compensating SALE_RETURN movement, so the stock ledger
 * continues to reconcile against StockBalance.
 *
 * Invoices with recorded recovery are refused: that money has to be refunded
 * or reallocated as its own accounting event before the sale can be unwound.
 */
export async function cancelInvoice(
  actor: Actor,
  invoiceId: string,
  reason: string,
) {
  assertPermission(actor, "CANCEL_INVOICE");

  return withSerializableRetry(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, status: { not: "CANCELLED" } },
      include: { items: true, payments: true },
    });
    if (!invoice) {
      throw new DomainError(
        409,
        "Select an invoice that has not already been cancelled.",
        "INVOICE_NOT_CANCELLABLE",
      );
    }
    if (invoice.paidAmount > 0 || invoice.payments.length > 0) {
      throw new DomainError(
        409,
        "This invoice has recorded recovery. Reverse or refund the payments before cancelling it.",
        "INVOICE_HAS_PAYMENTS",
      );
    }

    // Every stock movement this invoice caused is tagged with it, so the
    // return is derived from what actually left rather than from the invoice
    // lines — a partially issued invoice returns exactly what shipped.
    const issued = await tx.stockMovement.findMany({
      where: {
        referenceType: "INVOICE",
        referenceId: invoice.id,
        quantityOut: { gt: 0 },
      },
      include: { batch: true },
    });
    for (const movement of issued) {
      await receiveStock(tx, {
        productId: movement.productId,
        warehouseId: movement.warehouseId,
        quantity: movement.quantityOut,
        movementType: "SALE_RETURN",
        unitCost: movement.unitCost,
        referenceType: "INVOICE_CANCELLATION",
        referenceId: invoice.id,
        movementDate: new Date(),
        notes: reason,
        batch: movement.batch
          ? {
              batchNumber: movement.batch.batchNumber,
              manufacturingDate: movement.batch.manufacturingDate,
              expiryDate: movement.batch.expiryDate,
            }
          : undefined,
      });
    }

    const updated = await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        status: "CANCELLED",
        deliveryStatus: "CANCELLED",
        balanceAmount: 0,
      },
    });

    await writeAudit(tx, actor, {
      action: "CANCEL",
      entityType: "Invoice",
      entityId: invoice.id,
      before: invoice,
      after: { ...updated, reason },
    });

    // Reverses whatever was posted at invoice creation. Symmetric whether or
    // not stock had physically left: the SALE_RETURN movements above already
    // reversed stock at the same unitCost snapshot the original COGS line
    // used. Invoices with no ledger entry to reverse are tolerated by
    // reverseJournalEntry, which no-ops on them.
    await reverseJournalEntry(tx, {
      actor,
      entryDate: new Date(),
      originalReferenceType: "INVOICE",
      originalReferenceId: invoice.id,
      newReferenceType: "INVOICE_CANCELLATION",
      newReferenceId: invoice.id,
      description: `Cancel invoice ${invoice.invoiceNumber}: ${reason}`,
    });

    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      status: updated.status,
      stockRestored: issued.length > 0,
    };
  });
}
