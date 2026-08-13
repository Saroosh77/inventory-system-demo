"use client";

import { useState } from "react";
import type { DataModuleProps } from "../module-types";
import { ModuleTabs } from "../../ui/module-ui";
import ItemsPanel from "./panels/items-panel";
import StockBalancesPanel from "./panels/stock-balances-panel";
import AdjustmentsPanel from "./panels/adjustments-panel";
import TransfersPanel from "./panels/transfers-panel";
import MovementsPanel from "./panels/movements-panel";
import BatchesPanel from "./panels/batches-panel";

type InventoryPanel =
  | "stock"
  | "items"
  | "adjustments"
  | "transfers"
  | "movements"
  | "batches";

export default function InventoryModule(props: DataModuleProps) {
  const [panel, setPanel] = useState<InventoryPanel>("stock");
  const canAdjust = props.workspace.permissions.includes("ADJUST_INVENTORY");
  const canTransfer = props.workspace.permissions.includes(
    "TRANSFER_INVENTORY",
  );

  return (
    <div className="workspace-stack inventory-module">
      <ModuleTabs
        active={panel}
        onChange={setPanel}
        tabs={[
          { id: "stock", label: "Stock Balances" },
          { id: "items", label: "Items" },
          ...(canAdjust
            ? ([{ id: "adjustments", label: "Adjustments" }] as const)
            : []),
          ...(canTransfer
            ? ([{ id: "transfers", label: "Transfers" }] as const)
            : []),
          { id: "movements", label: "Movements" },
          { id: "batches", label: "Batches & Expiry" },
        ]}
      />

      {panel === "stock" ? <StockBalancesPanel {...props} /> : null}
      {panel === "items" ? <ItemsPanel {...props} /> : null}
      {panel === "adjustments" ? <AdjustmentsPanel {...props} /> : null}
      {panel === "transfers" ? <TransfersPanel {...props} /> : null}
      {panel === "movements" ? <MovementsPanel {...props} /> : null}
      {panel === "batches" ? <BatchesPanel {...props} /> : null}
    </div>
  );
}
