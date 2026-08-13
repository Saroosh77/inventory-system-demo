"use client";

import { formatPkr } from "@/lib/erp/format";
import type { WorkspaceData } from "@/lib/erp/types";
import { DataTable, SalesPill, WorkspaceHeading } from "../../../ui/module-ui";

export default function RecentInvoicesPanel({
  invoices,
}: {
  invoices: WorkspaceData["invoices"];
}) {
  return (
    <article className="panel workspace-panel">
      <WorkspaceHeading kicker="Latest" title="Recent invoices" />
      <DataTable
        empty={!invoices.length}
        headers={["Number", "Customer", "Type", "Net", "Balance"]}>
        {invoices.map((row) => (
          <tr key={row.id}>
            <td>{row.number}</td>
            <td>{row.customer}</td>
            <td>
              <SalesPill type={row.salesType} />
            </td>
            <td className="amount-cell">{formatPkr(row.netAmount)}</td>
            <td className="amount-cell recovered">
              {formatPkr(row.balanceAmount)}
            </td>
          </tr>
        ))}
      </DataTable>
    </article>
  );
}
