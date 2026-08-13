import { Prisma } from "@prisma/client";
import type { Actor } from "@/lib/server/access-control";
import { DomainError } from "@/lib/server/platform/domain-error";

export type DecimalInput = | string | number | Prisma.Decimal | Prisma.DecimalJsLike;

export function decimal(value: DecimalInput): Prisma.Decimal {
  return new Prisma.Decimal(
    typeof value === "object" ? value.toFixed() : value,
  );
}

export async function getAvailableQuantity(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
) {
  const aggregate = await tx.stockMovement.aggregate({
    where: { warehouseId, productId },
    _sum: { quantityIn: true, quantityOut: true },
  });

  return decimal(aggregate._sum.quantityIn ?? 0).minus(aggregate._sum.quantityOut ?? 0);
}

export async function requireWarehouseAccess(
  tx: Prisma.TransactionClient,
  actor: Actor,
  warehouseId: string,
) {
  const warehouse = await tx.warehouse.findFirst({
    where: { id: warehouseId, active: true },
  });
  if (!warehouse) throw new DomainError(404, "Select an active warehouse.", "WAREHOUSE_NOT_FOUND");

  if (actor.role === "WAREHOUSE_STAFF" && actor.warehouseId !== warehouse.id) {
    throw new DomainError(403, "Warehouse staff can only use their assigned warehouse.", "WAREHOUSE_SCOPE_VIOLATION");
  }

  return warehouse;
}

export function assertWarehouseAcceptsProduct(
  warehouse: { warehouseType: "COMPANY" | "DISTRIBUTOR" },
  product: { productType: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOOD" },
) {
  if (warehouse.warehouseType === "DISTRIBUTOR" && product.productType !== "FINISHED_GOOD") {
    throw new DomainError(
      422,
      "Distributor warehouses can contain finished goods only.",
      "INVALID_WAREHOUSE_PRODUCT",
    );
  }
}

export async function requireSufficientStock(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  requiredQuantity: Parameters<typeof decimal>[0],
) {
  const required = decimal(requiredQuantity);

  const balance = await tx.stockBalance.findUnique({
    where: {
      productId_warehouseId: {
        productId,
        warehouseId,
      },
    },
    select: {
      quantityOnHand: true,
      reservedQuantity: true,
    },
  });

  const available = balance
    ? balance.quantityOnHand.minus(balance.reservedQuantity)
    : decimal(0);

  if (available.lt(required)) {
    throw new DomainError(
      409,
      "There is not enough available stock in this warehouse.",
      "INSUFFICIENT_STOCK",
    );
  }

  return available;
}

/**
 * Holds stock for a confirmed sales order so it cannot be sold twice.
 *
 * `reservedQuantity` is subtracted from `quantityOnHand` by
 * requireSufficientStock, so a reservation makes the stock invisible to every
 * later order without moving the ledger. The reservation is released when the
 * stock physically leaves (issueDeliveryStock) or when the order or invoice is
 * cancelled — never on invoicing, because between invoice and issue the goods
 * are still on hand and must stay claimed.
 */
export async function reserveStock(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  quantity: DecimalInput,
) {
  const required = decimal(quantity);
  if (required.lte(0)) return;

  await requireSufficientStock(tx, warehouseId, productId, required);

  await tx.stockBalance.update({
    where: { productId_warehouseId: { productId, warehouseId } },
    data: {
      reservedQuantity: { increment: required },
      version: { increment: 1 },
    },
  });
}

/**
 * Frees a previously held reservation. Clamped at zero so replaying a release
 * — or issuing an order booked before reservations existed — can never drive
 * reservedQuantity negative and silently inflate available stock.
 */
export async function releaseReservation(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  quantity: DecimalInput,
) {
  const requested = decimal(quantity);
  if (requested.lte(0)) return;

  const balance = await tx.stockBalance.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
    select: { reservedQuantity: true },
  });
  if (!balance) return;

  const release = Prisma.Decimal.min(balance.reservedQuantity, requested);
  if (release.lte(0)) return;

  await tx.stockBalance.update({
    where: { productId_warehouseId: { productId, warehouseId } },
    data: {
      reservedQuantity: { decrement: release },
      version: { increment: 1 },
    },
  });
}

/**
 * Asserts the warehouse physically holds this quantity, ignoring reservations.
 *
 * Used at invoicing, where the order already owns a reservation and so must
 * not be measured against it. Reservations do not survive a stock adjustment
 * (a physical recount has to win), so this catches the case where held stock
 * was written off between booking and invoicing.
 */
export async function requireOnHandQuantity(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  requiredQuantity: DecimalInput,
) {
  const required = decimal(requiredQuantity);
  const balance = await tx.stockBalance.findUnique({
    where: { productId_warehouseId: { productId, warehouseId } },
    select: { quantityOnHand: true },
  });

  const onHand = balance ? balance.quantityOnHand : decimal(0);
  if (onHand.lt(required)) {
    throw new DomainError(
      409,
      "Stock for this order is no longer in the warehouse. Re-check inventory before invoicing.",
      "INSUFFICIENT_STOCK",
    );
  }

  return onHand;
}

export async function postStockMovement(
  tx: Prisma.TransactionClient,
  data: Prisma.StockMovementUncheckedCreateInput,
) {
  const quantityIn = decimal(data.quantityIn ?? 0);
  const quantityOut = decimal(data.quantityOut ?? 0);

  if (quantityIn.lt(0) || quantityOut.lt(0)) {
    throw new DomainError(
      422,
      "Stock movement quantities cannot be negative.",
      "INVALID_STOCK_MOVEMENT",
    );
  }

  const hasQuantityIn = quantityIn.gt(0);
  const hasQuantityOut = quantityOut.gt(0);

  if (hasQuantityIn === hasQuantityOut) {
    throw new DomainError(
      422,
      "A stock movement must contain either quantity in or quantity out.",
      "INVALID_STOCK_MOVEMENT",
    );
  }

  const delta = quantityIn.minus(quantityOut);

  // Ensure a row exists before incrementing. A single upsert with the raw
  // delta in create fails Postgres's CHECK constraint on stock-out moves:
  // ON CONFLICT DO UPDATE still validates the constraint against the raw
  // INSERT candidate row before conflict resolution runs, so a negative
  // delta is rejected even when the resulting merged balance would be
  // non-negative.
  //adds a new stock balance row if it doesn't exist, with quantityOnHand initialized to 0. 
  // This ensures that the subsequent update operation can safely increment or decrement the 
  // quantityOnHand without violating any constraints.
  await tx.stockBalance.upsert({
    where: {
      productId_warehouseId: {
        productId: data.productId,
        warehouseId: data.warehouseId,
      },
    },
    create: {
      productId: data.productId,
      warehouseId: data.warehouseId,
      quantityOnHand: 0,
    },
    update: {},
  });

  const balance = await tx.stockBalance.update({
    where: {
      productId_warehouseId: {
        productId: data.productId,
        warehouseId: data.warehouseId,
      },
    },
    data: {
      quantityOnHand: { increment: delta },
      version: { increment: 1 },
    },
  });

  if (balance.quantityOnHand.lt(0)) {
    throw new DomainError(
      409,
      "There is not enough stock in this warehouse.",
      "INSUFFICIENT_STOCK",
    );
  }

  const movement = await tx.stockMovement.create({
    data: {
      ...data,
      quantityIn,
      quantityOut,
    },
  });

  return { movement, balance };
}

export async function consumeBatchStock(
  tx: Prisma.TransactionClient,
  warehouseId: string,
  productId: string,
  requestedQuantity: DecimalInput,
) {
  let remaining = decimal(requestedQuantity);
  const batches = await tx.stockBatch.findMany({
    where: {
      warehouseId,
      productId,
      status: "ACTIVE",
      quantity: { gt: 0 },
    },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
  });
  const allocations: Array<{
    batch: (typeof batches)[number];
    quantity: Prisma.Decimal;
  }> = [];

  for (const batch of batches) {
    if (remaining.lte(0)) break;
    const quantity = Prisma.Decimal.min(batch.quantity, remaining);
    await tx.stockBatch.update({
      where: { id: batch.id },
      data: { quantity: { decrement: quantity } },
    });
    allocations.push({ batch, quantity });
    remaining = remaining.minus(quantity);
  }

  return { allocations, unbatchedQuantity: remaining };
}

export async function receiveBatchStock(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    warehouseId: string;
    batchNumber: string;
    manufacturingDate: Date | null;
    expiryDate: Date;
    quantity: DecimalInput;
  },
) {
  const where = {
    warehouseId_productId_batchNumber: {
      warehouseId: input.warehouseId,
      productId: input.productId,
      batchNumber: input.batchNumber,
    },
  } as const;
  const existing = await tx.stockBatch.findUnique({ where });

  if (existing) {
    const manufacturingMatches =
      existing.manufacturingDate?.getTime() ===
      input.manufacturingDate?.getTime();
    if (
      !manufacturingMatches ||
      existing.expiryDate.getTime() !== input.expiryDate.getTime()
    ) {
      throw new DomainError(
        409,
        "This batch number already exists with different manufacturing or expiry dates.",
        "BATCH_METADATA_CONFLICT",
      );
    }
    return tx.stockBatch.update({
      where,
      data: {
        quantity: { increment: decimal(input.quantity) },
        status: "ACTIVE",
      },
    });
  }

  return tx.stockBatch.create({
    data: {
      productId: input.productId,
      warehouseId: input.warehouseId,
      batchNumber: input.batchNumber,
      manufacturingDate: input.manufacturingDate,
      expiryDate: input.expiryDate,
      quantity: decimal(input.quantity),
    },
  });
}

type MovementContext = {
  movementType: Prisma.StockMovementUncheckedCreateInput["movementType"];
  unitCost: number;
  referenceType: string;
  referenceId: string;
  movementDate: Date;
  notes?: string;
};

/**
 * Consumes stock out of a warehouse: picks batches FIFO by expiry (via
 * consumeBatchStock), then posts one ledger movement per batch allocation
 * plus one for any unbatched remainder, so callers never have to hand-wire
 * batch picking to the balance/ledger update themselves.
 */
export async function consumeStock(
  tx: Prisma.TransactionClient,
  params: MovementContext & {
    productId: string;
    warehouseId: string;
    quantity: DecimalInput;
  },
) {
  const { allocations, unbatchedQuantity } = await consumeBatchStock(
    tx,
    params.warehouseId,
    params.productId,
    params.quantity,
  );

  const common = {
    productId: params.productId,
    warehouseId: params.warehouseId,
    movementType: params.movementType,
    unitCost: params.unitCost,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    movementDate: params.movementDate,
    notes: params.notes,
  } as const;

  for (const allocation of allocations) {
    await postStockMovement(tx, {
      ...common,
      batchId: allocation.batch.id,
      quantityOut: allocation.quantity,
    });
  }
  if (unbatchedQuantity.gt(0)) {
    await postStockMovement(tx, { ...common, quantityOut: unbatchedQuantity });
  }

  return { allocations, unbatchedQuantity };
}

/**
 * Receives stock into a warehouse: upserts the batch (via receiveBatchStock)
 * when batch info is supplied, then posts the ledger movement linked to that
 * batch, so a received batch can never end up without a matching movement
 * (or a movement pointing at the wrong/no batch).
 */
export async function receiveStock(
  tx: Prisma.TransactionClient,
  params: MovementContext & {
    productId: string;
    warehouseId: string;
    quantity: DecimalInput;
    batch?: {
      batchNumber: string;
      manufacturingDate: Date | null;
      expiryDate: Date;
    };
  },
) {
  let batchId: string | undefined;
  if (params.batch) {
    const batch = await receiveBatchStock(tx, {
      productId: params.productId,
      warehouseId: params.warehouseId,
      batchNumber: params.batch.batchNumber,
      manufacturingDate: params.batch.manufacturingDate,
      expiryDate: params.batch.expiryDate,
      quantity: params.quantity,
    });
    batchId = batch.id;
  }

  const { movement, balance } = await postStockMovement(tx, {
    productId: params.productId,
    warehouseId: params.warehouseId,
    batchId,
    movementType: params.movementType,
    quantityIn: params.quantity,
    unitCost: params.unitCost,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    movementDate: params.movementDate,
    notes: params.notes,
  });

  return { batchId, movement, balance };
}
