"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState, type SubmitEvent } from "react";
import { erpApi, errorMessage } from "@/lib/client/erp-api";
import { today } from "@/lib/client/date-utils";
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

type TransferLine = {
  productId: string;
  quantity: number;
  unitCost: number;
};

function emptyLine(productId = ""): TransferLine {
  return { productId, quantity: 1, unitCost: 0 };
}

export default function TransfersPanel(props: DataModuleProps) {
  const companyWarehouses = props.workspace.warehouses.filter(
    (warehouse) => warehouse.warehouseType === "COMPANY",
  );
  const [fromWarehouseId, setFromWarehouseId] = useState(
    props.workspace.actor.warehouseId ?? companyWarehouses[0]?.id ?? "",
  );
  const [toWarehouseId, setToWarehouseId] = useState("");
  const [transferDate, setTransferDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<TransferLine[]>([
    emptyLine(props.workspace.products[0]?.id),
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateLine(index: number, patch: Partial<TransferLine>) {
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
        data: { transferNumber: string };
      }>("/api/inventory/transfers", {
        method: "POST",
        body: JSON.stringify({
          fromWarehouseId,
          toWarehouseId,
          transferDate,
          notes: notes || undefined,
          items: lines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitCost: line.unitCost || undefined,
          })),
        }),
      });
      props.notify(`Stock transfer ${response.data.transferNumber} posted.`);
      setNotes("");
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
        <WorkflowStep number="1" label="Choose company warehouses" />
        <WorkflowStep number="2" label="Add products and quantities" />
        <WorkflowStep number="3" label="Validate source availability" />
        <WorkflowStep number="4" label="Post OUT and IN atomically" />
      </section>
      <section className="panel workspace-panel">
        <WorkspaceHeading
          kicker="Internal logistics"
          title="Company warehouse transfer"
          description="Distributor stock enters through primary sales. This screen moves unbatched stock between company warehouses."
        />
        <form className="erp-form module-inline-form" onSubmit={submit}>
          <div className="form-grid three">
            <SelectField
              label="Source warehouse"
              value={fromWarehouseId}
              onChange={setFromWarehouseId}
              disabled={props.workspace.actor.role === "WAREHOUSE_STAFF"}
              options={companyWarehouses}
              placeholder="Select source warehouse"
            />
            <SelectField
              label="Destination warehouse"
              value={toWarehouseId}
              onChange={setToWarehouseId}
              options={companyWarehouses.filter(
                (warehouse) => warehouse.id !== fromWarehouseId,
              )}
              placeholder="Select destination warehouse"
            />
            <Field
              label="Transfer date"
              type="date"
              value={transferDate}
              onChange={setTransferDate}
            />
          </div>
          <TextAreaField
            label="Notes"
            value={notes}
            onChange={setNotes}
            placeholder="Reason, vehicle, authorization reference…"
          />

          <div className="line-items module-line-editor">
            <div className="line-items-head">
              <h3>Transfer lines</h3>
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
            {lines.map((line, index) => (
              <div className="inventory-line-row transfer-line" key={index}>
                <span className="line-number">{index + 1}</span>
                <SelectField
                  label="Product"
                  value={line.productId}
                  onChange={(productId) =>
                    updateLine(index, {
                      productId,
                      unitCost:
                        props.workspace.products.find(
                          (product) => product.id === productId,
                        )?.standardCost ?? 0,
                    })
                  }
                  options={props.workspace.products.map((product) => ({
                    id: product.id,
                    name: `${product.sku} — ${product.name}`,
                  }))}
                  placeholder="Select product"
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
                <button
                  className="remove-line"
                  type="button"
                  aria-label="Remove transfer line"
                  disabled={lines.length === 1}
                  onClick={() =>
                    setLines((current) =>
                      current.filter((_, row) => row !== index),
                    )
                  }>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          {error ? <FormError error={error} /> : null}
          <ModalActions
            busy={busy}
            label="Post transfer"
            onClose={() => {
              setNotes("");
              setLines([emptyLine(props.workspace.products[0]?.id)]);
            }}
          />
        </form>
      </section>
    </div>
  );
}
