"use client";

import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState, type SubmitEvent } from "react";
import { erpApi, errorMessage, queryString } from "@/lib/client/erp-api";
import { today } from "@/lib/client/date-utils";
import { useErpData } from "@/lib/client/use-erp-query";
import type { DataModuleProps } from "../../module-types";
import {
  Field,
  FormError,
  ModalActions,
  SelectField,
  TextAreaField,
  WorkflowStep,
  WorkspaceHeading,
} from "../../../ui/module-ui";
import type {
  ListResponse,
  StockBatchRow,
} from "../inventory-types";

type AdjustmentLine = {
  productId: string;
  batchId: string;
  direction: "IN" | "OUT";
  quantity: number;
  unitCost: number;
};

function emptyLine(productId = ""): AdjustmentLine {
  return {
    productId,
    batchId: "",
    direction: "IN",
    quantity: 1,
    unitCost: 0,
  };
}

export default function AdjustmentsPanel(props: DataModuleProps) {
  const [warehouseId, setWarehouseId] = useState(
    props.workspace.actor.warehouseId ?? "",
  );
  const [adjustmentDate, setAdjustmentDate] = useState(today());
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<AdjustmentLine[]>([
    emptyLine(props.workspace.products[0]?.id),
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const batchesUrl = useMemo(
    () =>
      `/api/inventory/batches${queryString({
        warehouseId,
        status: "ACTIVE",
        page: 1,
        pageSize: 100,
      })}`,
    [warehouseId],
  );
  const { data: batches } = useErpData<ListResponse<StockBatchRow>>(
    batchesUrl,
    props.refreshVersion,
  );

  function updateLine(
    index: number,
    patch: Partial<AdjustmentLine>,
  ) {
    setLines((current) =>
      current.map((line, row) =>
        row === index ? { ...line, ...patch } : line,
      ),
    );
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await erpApi<{
        data: { adjustmentNumber: string };
      }>("/api/inventory/adjustments", {
        method: "POST",
        body: JSON.stringify({
          warehouseId,
          adjustmentDate,
          reason,
          items: lines.map((line) => ({
            productId: line.productId,
            batchId: line.batchId || null,
            direction: line.direction,
            quantity: line.quantity,
            unitCost: line.unitCost || undefined,
          })),
        }),
      });
      props.notify(
        `Inventory adjustment ${response.data.adjustmentNumber} posted.`,
      );
      setReason("");
      setLines([emptyLine(props.workspace.products[0]?.id)]);
      props.requestRefresh();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace-stack">
      <section className="workflow-steps panel">
        <WorkflowStep number="1" label="Select warehouse and reason" />
        <WorkflowStep number="2" label="Add increase or decrease lines" />
        <WorkflowStep number="3" label="Validate stock and batches" />
        <WorkflowStep number="4" label="Post balance and audit movement" />
      </section>
      <section className="panel workspace-panel">
        <WorkspaceHeading
          kicker="Controlled correction"
          title="Inventory adjustment"
          description="Use for opening stock, counts, damage, expiry or approved corrections—not normal purchases or sales."
        />
        <form className="erp-form module-inline-form" onSubmit={submit}>
          <div className="form-grid three">
            <SelectField
              label="Warehouse"
              value={warehouseId}
              onChange={setWarehouseId}
              disabled={props.workspace.actor.role === "WAREHOUSE_STAFF"}
              options={props.workspace.warehouses}
              placeholder="Select warehouse"
            />
            <Field
              label="Adjustment date"
              type="date"
              value={adjustmentDate}
              onChange={setAdjustmentDate}
            />
            <TextAreaField
              label="Reason"
              value={reason}
              onChange={setReason}
              required
              placeholder="Opening stock, physical count, damage correction…"
            />
          </div>

          <div className="line-items module-line-editor">
            <div className="line-items-head">
              <h3>Adjustment lines</h3>
              <button
                className="text-button"
                type="button"
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    emptyLine(props.workspace.products[0]?.id),
                  ])
                }>
                <Plus size={14} />
                Add line
              </button>
            </div>
            {lines.map((line, index) => {
              const batchOptions = (batches?.data ?? [])
                .filter((batch) => batch.product.id === line.productId)
                .map((batch) => ({
                  id: batch.id,
                  name: `${batch.batchNumber} — ${batch.quantity} available`,
                }));
              return (
                <div className="inventory-line-row" key={index}>
                  <span className="line-number">{index + 1}</span>
                  <SelectField
                    label="Product"
                    value={line.productId}
                    onChange={(productId) =>
                      updateLine(index, { productId, batchId: "" })
                    }
                    options={props.workspace.products.map((product) => ({
                      id: product.id,
                      name: `${product.sku} — ${product.name}`,
                    }))}
                    placeholder="Select product"
                  />
                  <SelectField
                    label="Direction"
                    value={line.direction}
                    onChange={(direction) =>
                      updateLine(index, {
                        direction: direction as AdjustmentLine["direction"],
                      })
                    }
                    options={[
                      { id: "IN", name: "Increase" },
                      { id: "OUT", name: "Decrease" },
                    ]}
                    placeholder="Select direction"
                  />
                  <Field
                    label="Quantity"
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={line.quantity}
                    onChange={(quantity) =>
                      updateLine(index, { quantity: Number(quantity) })
                    }
                  />
                  <Field
                    label="Unit cost"
                    type="number"
                    min="0"
                    value={line.unitCost}
                    onChange={(unitCost) =>
                      updateLine(index, { unitCost: Number(unitCost) })
                    }
                  />
                  <SelectField
                    label="Batch (optional)"
                    value={line.batchId}
                    onChange={(batchId) => updateLine(index, { batchId })}
                    options={batchOptions}
                    required={false}
                    placeholder="No batch allocation"
                  />
                  <button
                    className="remove-line"
                    type="button"
                    aria-label="Remove adjustment line"
                    disabled={lines.length === 1}
                    onClick={() =>
                      setLines((current) =>
                        current.filter((_, row) => row !== index),
                      )
                    }>
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}
          </div>

          {error ? <FormError error={error} /> : null}
          <ModalActions
            busy={busy}
            label="Post adjustment"
            onClose={() => {
              setReason("");
              setLines([emptyLine(props.workspace.products[0]?.id)]);
            }}
          />
        </form>
      </section>
    </div>
  );
}
