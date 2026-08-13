"use client";

import { AlertTriangle } from "lucide-react";
import type { WorkspaceData } from "@/lib/erp/types";
import { DataTable, WorkspaceHeading } from "../../../ui/module-ui";

export default function NearExpiryPanel({
  warehouses,
  nearExpiry,
}: {
  warehouses: WorkspaceData["warehouses"];
  nearExpiry: WorkspaceData["nearExpiry"];
}) {
  const warehouseName = new Map(
    warehouses.map((row) => [row.id, row.shortName]),
  );

  return (
    <article className="panel workspace-panel expiry-panel">
      <WorkspaceHeading
        kicker="Inventory"
        title="Expiring stock"
        description="Active batches expiring within 90 days."
      />
      <DataTable
        empty={!nearExpiry.length}
        emptyLabel="Nothing expiring within 90 days"
        headers={["Warehouse", "Batches"]}>
        {nearExpiry.map((row) => (
          <tr key={row.warehouseId}>
            <td>{warehouseName.get(row.warehouseId) ?? row.warehouseId}</td>
            <td>
              <span className="expiry-count">
                <AlertTriangle size={13} />
                {row.count}
              </span>
            </td>
          </tr>
        ))}
      </DataTable>
    </article>
  );
}
