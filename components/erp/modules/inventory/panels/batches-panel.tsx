"use client";

import { useMemo, useState } from "react";
import { queryString } from "@/lib/client/erp-api";
import { useErpData } from "@/lib/client/use-erp-query";
import type { DataModuleProps } from "../../module-types";
import {
  DataTable,
  ModuleState,
  Pagination,
  StatusPill,
  WorkspaceHeading,
} from "../../../ui/module-ui";
import type { ListResponse, StockBatchRow } from "../inventory-types";

export default function BatchesPanel(props: DataModuleProps) {
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [status, setStatus] = useState("");
  const [expiringBefore, setExpiringBefore] = useState("");
  const url = useMemo(
    () =>
      `/api/inventory/batches${queryString({
        page,
        pageSize: 25,
        warehouseId,
        status,
        expiringBefore,
      })}`,
    [expiringBefore, page, status, warehouseId],
  );
  const { data, error, loading, reload } = useErpData<
    ListResponse<StockBatchRow>
  >(url, props.refreshVersion);

  if (loading && !data) {
    return <ModuleState title="Loading batches…" loading />;
  }
  if (error && !data) {
    return (
      <ModuleState
        title="Batches are unavailable"
        description={error}
        onRetry={reload}
      />
    );
  }

  return (
    <section className="panel workspace-panel">
      <WorkspaceHeading
        kicker="Traceability"
        title="Batches and expiry"
        description="Production outputs and batch-enabled purchase receipts are tracked by warehouse and expiry date."
      />
      <div className="module-toolbar">
        <label>
          <span>Warehouse</span>
          <select
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value);
              setPage(1);
            }}>
            <option value="">All visible warehouses</option>
            {props.workspace.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="EXPIRED">Expired</option>
            <option value="RECALLED">Recalled</option>
          </select>
        </label>
        <label>
          <span>Expiring before</span>
          <input
            type="date"
            value={expiringBefore}
            onChange={(event) => setExpiringBefore(event.target.value)}
          />
        </label>
      </div>
      <DataTable
        empty={!data?.data.length}
        headers={[
          "Batch",
          "Product",
          "Warehouse",
          "Manufactured",
          "Expiry",
          "Quantity",
          "Status",
        ]}>
        {data?.data.map((row) => (
          <tr key={row.id}>
            <td>
              <strong>{row.batchNumber}</strong>
            </td>
            <td>
              <strong>{row.product.name}</strong>
              <small>{row.product.sku}</small>
            </td>
            <td>{row.warehouse.shortName}</td>
            <td>{row.manufacturingDate ?? "—"}</td>
            <td>{row.expiryDate}</td>
            <td className="amount-cell">{row.quantity.toLocaleString()}</td>
            <td>
              <StatusPill value={row.status} />
            </td>
          </tr>
        ))}
      </DataTable>
      {data ? (
        <Pagination {...data.pagination} onChange={setPage} />
      ) : null}
    </section>
  );
}
