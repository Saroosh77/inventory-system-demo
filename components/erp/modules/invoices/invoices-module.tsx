"use client";

import { CircleDollarSign, ShieldCheck, Store } from "lucide-react";
import { useState } from "react";
import { formatPkr } from "@/lib/erp/format";
import type {
  ErpAction,
  WorkspaceData,
  WorkspaceInvoice,
} from "@/lib/erp/types";
import {
  DataTable,
  SalesPill,
  StatusPill,
  Summary,
  WorkspaceHeading,
} from "../../ui/module-ui";
import { CancelDocumentModal } from "../../ui/cancel-document-modal";

export default function InvoicesModule({
  workspace,
  onAction,
}: {
  workspace: WorkspaceData;
  onAction: (action: ErpAction) => Promise<unknown>;
}) {
  const [cancelTarget, setCancelTarget] = useState<WorkspaceInvoice | null>(
    null,
  );
  const canCancel = workspace.permissions.includes("CANCEL_INVOICE");

  return (
    <div className="workspace-stack">
      <section className="workspace-summary-grid">
        <Summary
          label="Primary"
          value={formatPkr(workspace.totals.primarySales, true)}
          icon={Store}
        />
        <Summary
          label="Direct"
          value={formatPkr(workspace.totals.directSales, true)}
          icon={CircleDollarSign}
        />
        <Summary
          label="Secondary monitoring"
          value={formatPkr(workspace.totals.secondarySales, true)}
          icon={ShieldCheck}
        />
      </section>

      <section className="panel workspace-panel">
        <WorkspaceHeading
          kicker="Finance register"
          title="GST and non-GST invoices"
          description="Invoices are created from booked sales orders and remain linked to delivery and recovery."
        />
        <DataTable
          empty={!workspace.invoices.length}
          headers={[
            "Invoice",
            "Sale",
            "Tax",
            "Customer",
            "Warehouse",
            "Delivery",
            "Net",
            "Outstanding",
            "",
          ]}>
          {workspace.invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td>
                <strong>{invoice.number}</strong>
                <small>{invoice.date}</small>
              </td>
              <td>
                <SalesPill type={invoice.salesType} />
              </td>
              <td>
                <span className={`tax-pill ${invoice.taxType.toLowerCase()}`}>
                  {invoice.taxType}
                  {invoice.taxType === "GST"
                    ? ` ${(invoice.taxRateBps / 100).toFixed(0)}%`
                    : ""}
                </span>
                <small>
                  {invoice.taxAmount
                    ? formatPkr(invoice.taxAmount)
                    : "Zero tax"}
                </small>
              </td>
              <td>{invoice.customer}</td>
              <td>{invoice.warehouse}</td>
              <td>
                <StatusPill value={invoice.deliveryStatus} />
              </td>
              <td className="amount-cell">{formatPkr(invoice.netAmount)}</td>
              <td className="amount-cell outstanding">
                {formatPkr(invoice.balanceAmount)}
              </td>
              <td>
                {canCancel && invoice.status !== "CANCELLED" ? (
                  <button
                    className="table-action destructive"
                    type="button"
                    onClick={() => setCancelTarget(invoice)}>
                    Cancel
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </DataTable>
      </section>

      {cancelTarget ? (
        <CancelDocumentModal
          title="Cancel invoice"
          documentNumber={cancelTarget.number}
          consequence={
            cancelTarget.deliveryStatus === "STOCK_ISSUED" ||
            cancelTarget.deliveryStatus === "DELIVERED"
              ? "The receivable is written back to zero and the stock that already left the warehouse is returned with matching ledger entries. For a delivered primary sale the goods are also pulled back out of the distributor warehouse."
              : "The receivable is written back to zero and the stock this invoice was holding is released back to available inventory. Nothing has shipped, so no goods movement is needed."
          }
          buildAction={(reason) => ({
            action: "cancelInvoice",
            invoiceId: cancelTarget.id,
            reason,
          })}
          onClose={() => setCancelTarget(null)}
          onAction={onAction}
        />
      ) : null}
    </div>
  );
}
