"use client";

import type { WorkspaceData } from "@/lib/erp/types";
import { DataTable, WorkspaceHeading } from "../../../ui/module-ui";

export default function WarehouseOverviewPanel({
  stock,
  nearExpiry,
}: {
  stock: WorkspaceData["stock"];
  nearExpiry: WorkspaceData["nearExpiry"];
}) {
  const totalValue = Math.max(
    1,
    stock.reduce((sum, row) => sum + (row.stockValue ?? 0), 0),
  );
  const expiryByWarehouse = new Map(
    nearExpiry.map((row) => [row.warehouseId, row.count]),
  );

  return (
    <article className="panel workspace-panel">
      <WorkspaceHeading kicker="Inventory" title="Warehouse stock overview" />
      <DataTable
        empty={!stock.length}
        headers={["Warehouse", "Share of stock value", "Expiring within 90 days"]}>
        {stock.map((row) => {
          const expiring = expiryByWarehouse.get(row.id) ?? 0;
          return (
            <tr key={row.id}>
              <td>{row.shortName}</td>
              <td>{Math.round(((row.stockValue ?? 0) / totalValue) * 100)}%</td>
              <td>
                {expiring
                  ? `${expiring} batch${expiring === 1 ? "" : "es"}`
                  : "None"}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </article>
  );
}
