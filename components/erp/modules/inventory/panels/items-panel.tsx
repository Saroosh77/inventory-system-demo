"use client";

import { useMemo, useState, type SubmitEvent } from "react";
import { erpApi, errorMessage, queryString } from "@/lib/client/erp-api";
import { useErpData } from "@/lib/client/use-erp-query";
import { formatPkr } from "@/lib/erp/format";
import type { DataModuleProps } from "../../module-types";
import {
  DataTable,
  Field,
  FormError,
  Modal,
  ModalActions,
  ModuleState,
  Pagination,
  SelectField,
  StatusPill,
  WorkspaceHeading,
} from "../../../ui/module-ui";
import type {
  InventoryItem,
  ListResponse,
} from "../inventory-types";

const units = [
  "GRAM",
  "KILOGRAM",
  "MILLILITRE",
  "LITRE",
  "PIECE",
  "PACKET",
  "CARTON",
  "BAG",
].map((id) => ({ id, name: id.replaceAll("_", " ") }));

export default function ItemsPanel(props: DataModuleProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [productType, setProductType] = useState("");
  const [active, setActive] = useState("true");
  const [editing, setEditing] = useState<InventoryItem | "new" | null>(null);

  const url = useMemo(
    () =>
      `/api/inventory/items${queryString({
        page,
        pageSize: 25,
        search,
        productType,
        active,
      })}`,
    [active, page, productType, search],
  );
  const { data, error, loading, reload } = useErpData<
    ListResponse<InventoryItem>
  >(url, props.refreshVersion);

  if (loading && !data) {
    return <ModuleState title="Loading inventory items…" loading />;
  }
  if (error && !data) {
    return (
      <ModuleState
        title="Inventory items are unavailable"
        description={error}
        onRetry={reload}
      />
    );
  }

  return (
    <section className="panel workspace-panel">
      <WorkspaceHeading
        kicker="Product catalogue"
        title="Inventory items"
        description="Raw materials, packaging and finished goods share one controlled catalogue."
        action={
          props.workspace.permissions.includes("MANAGE_INVENTORY_ITEMS")
            ? "Create item"
            : undefined
        }
        onAction={() => setEditing("new")}
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
          <span>Product type</span>
          <select
            value={productType}
            onChange={(event) => {
              setProductType(event.target.value);
              setPage(1);
            }}>
            <option value="">All visible types</option>
            <option value="RAW_MATERIAL">Raw material</option>
            <option value="PACKAGING">Packaging</option>
            <option value="FINISHED_GOOD">Finished good</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select
            value={active}
            onChange={(event) => {
              setActive(event.target.value);
              setPage(1);
            }}>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      <DataTable
        empty={!data?.data.length}
        headers={[
          "SKU",
          "Name",
          "Class",
          "Supply",
          "Base unit",
          "Cost",
          "Price",
          "Status",
          "",
        ]}>
        {data?.data.map((item) => (
          <tr key={item.id} className={item.active ? "" : "inactive-row"}>
            <td>
              <strong>{item.sku}</strong>
            </td>
            <td>{item.name}</td>
            <td>
              <span
                className={`product-pill ${item.productType.toLowerCase()}`}>
                {item.productType.replaceAll("_", " ")}
              </span>
            </td>
            <td>{item.supplyType.replaceAll("_", " ")}</td>
            <td>{item.baseUnit.replaceAll("_", " ")}</td>
            <td className="amount-cell">
              {item.standardCost === null
                ? "Restricted"
                : formatPkr(item.standardCost)}
            </td>
            <td className="amount-cell">{formatPkr(item.defaultPrice)}</td>
            <td>
              <StatusPill value={item.active ? "ACTIVE" : "INACTIVE"} />
            </td>
            <td>
              {props.workspace.permissions.includes(
                "MANAGE_INVENTORY_ITEMS",
              ) ? (
                <button
                  className="table-action"
                  type="button"
                  onClick={() => setEditing(item)}>
                  Edit
                </button>
              ) : null}
            </td>
          </tr>
        ))}
      </DataTable>

      {data ? (
        <Pagination
          {...data.pagination}
          onChange={setPage}
        />
      ) : null}

      {editing ? (
        <ItemModal
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(message) => {
            props.notify(message);
            setEditing(null);
            reload();
            props.requestRefresh();
          }}
        />
      ) : null}
    </section>
  );
}

function ItemModal({
  item,
  onClose,
  onSaved,
}: {
  item: InventoryItem | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [sku, setSku] = useState(item?.sku ?? "");
  const [name, setName] = useState(item?.name ?? "");
  const [productType, setProductType] = useState(
    item?.productType ?? "RAW_MATERIAL",
  );
  const [supplyType, setSupplyType] = useState(
    item?.supplyType ?? "PURCHASED",
  );
  const [baseUnit, setBaseUnit] = useState(item?.baseUnit ?? "KILOGRAM");
  const [salesUnit, setSalesUnit] = useState(item?.salesUnit ?? "");
  const [standardCost, setStandardCost] = useState(item?.standardCost ?? 0);
  const [defaultPrice, setDefaultPrice] = useState(item?.defaultPrice ?? 0);
  const [active, setActive] = useState(item?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const body = {
      sku,
      name,
      productType,
      supplyType,
      baseUnit,
      salesUnit: salesUnit || undefined,
      standardCost,
      defaultPrice,
      ...(item ? { active, expectedVersion: item.version } : {}),
    };

    try {
      if (item) {
        await erpApi(`/api/inventory/items/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        onSaved(`${name} updated.`);
      } else {
        await erpApi("/api/inventory/items", {
          method: "POST",
          body: JSON.stringify(body),
        });
        onSaved(`${name} created.`);
      }
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={item ? `Edit ${item.name}` : "Create inventory item"}
      subtitle="Classification controls where the item can be purchased, stored, sold or manufactured."
      onClose={onClose}
      size="compact">
      <form className="erp-form compact-form" onSubmit={submit}>
        <div className="form-grid two">
          <Field
            label="SKU"
            value={sku}
            onChange={setSku}
            placeholder="e.g. FG-1001"
          />
          <Field
            label="Name"
            value={name}
            onChange={setName}
            placeholder="e.g. Chicken Seekh Kebab 500g"
          />
          <SelectField
            label="Product type"
            value={productType}
            onChange={(value) => {
              setProductType(value as typeof productType);
              if (value !== "FINISHED_GOOD") setSupplyType("PURCHASED");
            }}
            options={[
              { id: "RAW_MATERIAL", name: "Raw material" },
              { id: "PACKAGING", name: "Packaging" },
              { id: "FINISHED_GOOD", name: "Finished good" },
            ]}
            placeholder="Select product type"
          />
          <SelectField
            label="Supply type"
            value={supplyType}
            onChange={(value) => setSupplyType(value as typeof supplyType)}
            options={[
              { id: "PURCHASED", name: "Purchased" },
              ...(productType === "FINISHED_GOOD"
                ? [{ id: "MANUFACTURED", name: "Manufactured" }]
                : []),
            ]}
            placeholder="Select supply type"
          />
          <SelectField
            label="Base unit"
            value={baseUnit}
            onChange={setBaseUnit}
            options={units}
            placeholder="Select base unit"
          />
          <Field
            label="Sales unit"
            value={salesUnit}
            onChange={setSalesUnit}
            placeholder="e.g. kg, box, pack"
          />
          <Field
            label="Standard cost (PKR)"
            type="number"
            min="0"
            value={standardCost}
            onChange={(value) => setStandardCost(Number(value))}
          />
          <Field
            label="Default price (PKR)"
            type="number"
            min="0"
            value={defaultPrice}
            onChange={(value) => setDefaultPrice(Number(value))}
          />
          {item ? (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={active}
                onChange={(event) => setActive(event.target.checked)}
              />
              Active item
            </label>
          ) : null}
        </div>
        {error ? <FormError error={error} /> : null}
        <ModalActions
          busy={busy}
          label={item ? "Save item" : "Create item"}
          onClose={onClose}
        />
      </form>
    </Modal>
  );
}
