"use client";

import { useMemo, useState } from "react";
import { queryString } from "@/lib/client/erp-api";
import { useErpData } from "@/lib/client/use-erp-query";
import { formatPkr } from "@/lib/erp/format";
import type { DataModuleProps } from "../../module-types";
import {
  DataTable,
  ModuleState,
  Pagination,
  StatusPill,
  WorkspaceHeading,
} from "../../../ui/module-ui";
import type {
  ListResponse,
  StockMovementRow,
} from "../inventory-types";

export default function MovementsPanel(props: DataModuleProps) {
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const url = useMemo(
    () =>
      `/api/inventory/movements${queryString({
        page,
        pageSize: 50,
        warehouseId,
        dateFrom,
        dateTo,
      })}`,
    [dateFrom, dateTo, page, warehouseId],
  );
  const { data, error, loading, reload } = useErpData<
    ListResponse<StockMovementRow>
  >(url, props.refreshVersion);

  if (loading && !data) {
    return <ModuleState title="Loading movement history…" loading />;
  }
  if (error && !data) {
    return (
      <ModuleState
        title="Stock movements are unavailable"
        description={error}
        onRetry={reload}
      />
    );
  }

  return (
    <section className="panel workspace-panel">
      <WorkspaceHeading
        kicker="Immutable audit trail"
        title="Stock movements"
        description="Every receipt, issue, adjustment, transfer and production posting creates a ledger entry."
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
          <span>From</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => setDateFrom(event.target.value)}
          />
        </label>
        <label>
          <span>To</span>
          <input
            type="date"
            value={dateTo}
            onChange={(event) => setDateTo(event.target.value)}
          />
        </label>
      </div>
      <DataTable
        empty={!data?.data.length}
        headers={[
          "Date",
          "Movement",
          "Product",
          "Warehouse",
          "Batch",
          "In",
          "Out",
          "Unit cost",
          "Reference",
        ]}>
        {data?.data.map((row) => (
          <tr key={row.id}>
            <td>{row.movementDate}</td>
            <td>
              <StatusPill value={row.movementType} />
            </td>
            <td>
              <strong>{row.product.name}</strong>
              <small>{row.product.sku}</small>
            </td>
            <td>{row.warehouse.shortName}</td>
            <td>{row.batch?.batchNumber ?? "—"}</td>
            <td className="amount-cell recovered">
              {row.quantityIn ? row.quantityIn.toLocaleString() : "—"}
            </td>
            <td className="amount-cell outstanding">
              {row.quantityOut ? row.quantityOut.toLocaleString() : "—"}
            </td>
            <td className="amount-cell">
              {row.unitCost === null ? "Restricted" : formatPkr(row.unitCost)}
            </td>
            <td>
              <strong>{row.referenceType.replaceAll("_", " ")}</strong>
              <small>{row.referenceId}</small>
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
