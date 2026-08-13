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
  WorkspaceHeading,
} from "../../../ui/module-ui";
import type {
  ListResponse,
  StockBalanceRow,
} from "../inventory-types";

export default function StockBalancesPanel(props: DataModuleProps) {
  const [page, setPage] = useState(1);
  const [warehouseId, setWarehouseId] = useState("");
  const [search, setSearch] = useState("");
  const url = useMemo(
    () =>
      `/api/inventory/stock${queryString({
        page,
        pageSize: 25,
        warehouseId,
        search,
      })}`,
    [page, search, warehouseId],
  );
  const { data, error, loading, reload } = useErpData<
    ListResponse<StockBalanceRow>
  >(url, props.refreshVersion);

  if (loading && !data) {
    return <ModuleState title="Loading stock balances…" loading />;
  }
  if (error && !data) {
    return (
      <ModuleState
        title="Stock balances are unavailable"
        description={error}
        onRetry={reload}
      />
    );
  }

  return (
    <section className="panel workspace-panel">
      <WorkspaceHeading
        kicker="Current inventory"
        title="Stock balances"
        description="The product name comes from the Product relation; StockBalance stores only quantities and remains synchronized after renaming."
      />
      <div className="module-toolbar">
        <label className="module-search">
          <span>Search</span>
          <input
            placeholder="SKU or product name"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </label>
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
      </div>
      <DataTable
        empty={!data?.data.length}
        headers={[
          "Product",
          "SKU",
          "Type",
          "Warehouse",
          "City",
          "On hand",
          "Reserved",
          "Available",
          "Value",
        ]}>
        {data?.data.map((row) => (
          <tr key={`${row.warehouse.id}-${row.product.id}`}>
            <td>
              <strong>{row.product.name}</strong>
              <small>{row.product.baseUnit.replaceAll("_", " ")}</small>
            </td>
            <td>{row.product.sku}</td>
            <td>
              <span
                className={`product-pill ${row.product.productType.toLowerCase()}`}>
                {row.product.productType.replaceAll("_", " ")}
              </span>
            </td>
            <td>
              <strong>{row.warehouse.shortName}</strong>
              <small>{row.warehouse.warehouseType}</small>
            </td>
            <td>{row.warehouse.city}</td>
            <td className="amount-cell">
              {row.quantityOnHand.toLocaleString()}
            </td>
            <td className="amount-cell">
              {row.reservedQuantity.toLocaleString()}
            </td>
            <td className="amount-cell recovered">
              {row.availableQuantity.toLocaleString()}
            </td>
            <td className="amount-cell">
              {row.stockValue === null ? "Restricted" : formatPkr(row.stockValue)}
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
