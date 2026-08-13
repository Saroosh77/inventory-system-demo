import { MovementType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, can, visibleProductTypes, type Actor } from "@/lib/server/access-control";
import { writeAudit } from "@/lib/server/platform/audit-service";
import { formatDateOnly, parseDateOnly, parsePostingDate } from "@/lib/server/platform/date";
import { DomainError } from "@/lib/server/platform/domain-error";
import { nextDocumentNumber } from "@/lib/server/platform/number-service";
import { withSerializableRetry } from "@/lib/server/platform/transaction";
import type { BatchQuery, CreateAdjustmentInput, CreateTransferInput, MovementQuery, StockQuery } from "./inventory-validation";
import { assertWarehouseAcceptsProduct, consumeStock, decimal, postStockMovement, receiveStock, requireSufficientStock, requireWarehouseAccess } from "./stock-ledger";
import { postJournalEntry } from "../ledger/ledger-service";
import { inventoryAdjustmentLines } from "../ledger/ledger-rules";

function warehouseScope(actor: Actor, requestedWarehouseId?: string) {
  if (actor.role !== "WAREHOUSE_STAFF") return requestedWarehouseId;
  if (requestedWarehouseId && actor.warehouseId !== requestedWarehouseId) {
    throw new DomainError(403, "Warehouse staff can only view their assigned warehouse.", "WAREHOUSE_SCOPE_VIOLATION");
  }
  return actor.warehouseId ?? "__unassigned__";
}

export async function listStock(actor: Actor, query: StockQuery) {
  assertPermission(actor, "VIEW_INVENTORY");
  const warehouseId = warehouseScope(actor, query.warehouseId);
  const productTypes = visibleProductTypes(actor.role);
  const includeCost = can(actor.role, "VIEW_INVENTORY_COST");

  const where: Prisma.StockBalanceWhereInput = {
      ...(warehouseId ? { warehouseId } : {}),
      ...(query.productId ? { productId: query.productId } : {}),
      product: {
        productType: { in: [...productTypes] },
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: "insensitive" } },
                { sku: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
    }

    const [rows, total] = await Promise.all([
    prisma.stockBalance.findMany({
      where,
      include: {
        product: true,
        warehouse: {
          include: {
            city: true,
          },
        },
      },
      orderBy: [
        { warehouse: { name: "asc" } },
        { product: { name: "asc" } },
      ],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),

    prisma.stockBalance.count({ where }),
  ]);

  return {
     data: rows.map((row) => {
      const quantityOnHand = Number(row.quantityOnHand);
      const reservedQuantity = Number(row.reservedQuantity);
      const availableQuantity = quantityOnHand - reservedQuantity;

      return {
        warehouse: {
          id: row.warehouse.id,
          name: row.warehouse.name,
          shortName: row.warehouse.shortName,
          warehouseType: row.warehouse.warehouseType,
          city: row.warehouse.city.name,
        },
        product: {
          id: row.product.id,
          sku: row.product.sku,
          name: row.product.name,
          productType: row.product.productType,
          supplyType: row.product.supplyType,
          baseUnit: row.product.baseUnit,
        },

        quantity: quantityOnHand,

        quantityOnHand,
        reservedQuantity,
        availableQuantity,
        version: row.version,

        standardCost: includeCost 
          ? row.product.standardCost 
          : null,

        stockValue: includeCost 
          ? quantityOnHand * Number(row.product.standardCost) 
          : null,
      };
    }),

    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total
    },
  };
}

export async function listBatches(actor: Actor, query: BatchQuery) {
  assertPermission(actor, "VIEW_INVENTORY");
  const warehouseId = warehouseScope(actor, query.warehouseId);
  const where: Prisma.StockBatchWhereInput = {
    ...(warehouseId ? { warehouseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.expiringBefore ? { expiryDate: { lte: parseDateOnly(query.expiringBefore) } } : {}),
    product: { productType: { in: [...visibleProductTypes(actor.role)] } },
  };

  const [rows, total] = await Promise.all([
    prisma.stockBatch.findMany({
      where,
      include: { product: true, warehouse: true },
      orderBy: [{ expiryDate: "asc" }, { batchNumber: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockBatch.count({ where }),
  ]);

  return {
    data: rows.map((row) => ({
      id: row.id,
      batchNumber: row.batchNumber,
      product: { id: row.product.id, sku: row.product.sku, name: row.product.name, baseUnit: row.product.baseUnit },
      warehouse: { id: row.warehouse.id, name: row.warehouse.name, shortName: row.warehouse.shortName },
      manufacturingDate: formatDateOnly(row.manufacturingDate),
      expiryDate: formatDateOnly(row.expiryDate),
      quantity: Number(row.quantity),
      status: row.status,
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function listMovements(actor: Actor, query: MovementQuery) {
  assertPermission(actor, "VIEW_INVENTORY");
  const warehouseId = warehouseScope(actor, query.warehouseId);
  const where: Prisma.StockMovementWhereInput = {
    ...(warehouseId ? { warehouseId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.referenceType ? { referenceType: query.referenceType } : {}),
    ...(query.dateFrom || query.dateTo
      ? {
          movementDate: {
            ...(query.dateFrom ? { gte: parseDateOnly(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: parseDateOnly(query.dateTo) } : {}),
          },
        }
      : {}),
    product: { productType: { in: [...visibleProductTypes(actor.role)] } },
  };

  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: { product: true, warehouse: true, batch: true },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  const includeCost = can(actor.role, "VIEW_INVENTORY_COST");

  return {
    data: rows.map((row) => ({
      id: row.id,
      movementDate: formatDateOnly(row.movementDate),
      movementType: row.movementType,
      product: { id: row.product.id, sku: row.product.sku, name: row.product.name, baseUnit: row.product.baseUnit },
      warehouse: { id: row.warehouse.id, name: row.warehouse.name, shortName: row.warehouse.shortName },
      batch: row.batch ? { id: row.batch.id, batchNumber: row.batch.batchNumber } : null,
      quantityIn: Number(row.quantityIn),
      quantityOut: Number(row.quantityOut),
      unitCost: includeCost ? row.unitCost : null,
      referenceType: row.referenceType,
      referenceId: row.referenceId,
      notes: row.notes,
    })),
    pagination: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function createAdjustment(actor: Actor, input: CreateAdjustmentInput) {
  assertPermission(actor, "ADJUST_INVENTORY");
  const adjustmentDate = parsePostingDate(input.adjustmentDate, "adjustment date");

  return withSerializableRetry(async (tx) => {
    const warehouse = await requireWarehouseAccess(tx, actor, input.warehouseId);
    const productIds = [...new Set(input.items.map((item) => item.productId))];
    const products = await tx.product.findMany({ where: { id: { in: productIds }, active: true } });
    if (products.length !== productIds.length) {
      throw new DomainError(422, "Every adjustment item must reference an active product.", "INVALID_PRODUCT");
    }
    const productMap = new Map(products.map((row) => [row.id, row]));

    for (const item of input.items) {
      const product = productMap.get(item.productId)!;
      assertWarehouseAcceptsProduct(warehouse, product);
      const requested = decimal(item.quantity);
      if (item.direction === "OUT") {
        await requireSufficientStock(tx, warehouse.id, product.id, requested);
      }
      if (item.batchId) {
        const batch = await tx.stockBatch.findFirst({
          where: {
            id: item.batchId,
            productId: product.id,
            warehouseId: warehouse.id,
            status: "ACTIVE",
          },
        });
        if (!batch) throw new DomainError(422, "The selected batch does not match the item and warehouse.", "INVALID_BATCH");
        if (item.direction === "OUT" && batch.quantity.lt(requested)) {
          throw new DomainError(409, "The selected batch does not contain enough stock.", "INSUFFICIENT_BATCH_STOCK");
        }
      }
    }

    const adjustmentNumber = await nextDocumentNumber(tx, "inventory-adjustment", "ADJ", adjustmentDate);
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        adjustmentNumber,
        warehouseId: warehouse.id,
        adjustmentDate,
        reason: input.reason,
        createdById: actor.id,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            batchId: item.batchId ?? null,
            direction: item.direction,
            quantity: decimal(item.quantity),
            unitCost: item.unitCost ?? productMap.get(item.productId)!.standardCost,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of adjustment.items) {
      const movementType: MovementType = item.direction === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT";
     
// OLD: Direct StockMovement write.
// REPLACED BY: postStockMovement(), which updates StockBalance
// and creates the StockMovement atomically.

    await postStockMovement(tx, {
      productId: item.productId,
      warehouseId: warehouse.id,
      batchId: item.batchId,
      movementType,
      quantityIn: item.direction === "IN" ? item.quantity : 0,
      quantityOut: item.direction === "OUT" ? item.quantity : 0,
      unitCost: item.unitCost,
      referenceType: "INVENTORY_ADJUSTMENT",
      referenceId: adjustment.id,
      movementDate: adjustmentDate,
      notes: input.reason,
    });
    
      if (item.batchId) {
        await tx.stockBatch.update({
          where: { id: item.batchId },
          data: {
            quantity: item.direction === "IN"
              ? { increment: item.quantity }
              : { decrement: item.quantity },
          },
        });
      }
    }

    // Company balance sheet scope only — a DISTRIBUTOR warehouse's stock
    // isn't a company asset, so a write-off or correction there has no
    // company ledger effect. One entry per adjustment: OUT items land in
    // Inventory Write-off Expense, IN items (found stock / corrections)
    // land against Owner's Equity, since neither has an originating cost
    // document of its own.
    if (warehouse.warehouseType === "COMPANY") {
      const outAmount = adjustment.items
        .filter((item) => item.direction === "OUT")
        .reduce((sum, item) => sum + Math.round(item.quantity.times(item.unitCost).toNumber()), 0);
      const inAmount = adjustment.items
        .filter((item) => item.direction === "IN")
        .reduce((sum, item) => sum + Math.round(item.quantity.times(item.unitCost).toNumber()), 0);

      await postJournalEntry(tx, {
        actor,
        entryDate: adjustmentDate,
        referenceType: "INVENTORY_ADJUSTMENT",
        referenceId: adjustment.id,
        description: `Adjustment ${adjustmentNumber}: ${input.reason}`,
        lines: [
          ...inventoryAdjustmentLines("OUT", outAmount),
          ...inventoryAdjustmentLines("IN", inAmount),
        ],
      });
    }

    await writeAudit(tx, actor, {
      action: "POST",
      entityType: "InventoryAdjustment",
      entityId: adjustment.id,
      after: adjustment,
    });
    return { id: adjustment.id, adjustmentNumber };
  });
}

export async function createTransfer(actor: Actor, input: CreateTransferInput) {
  assertPermission(actor, "TRANSFER_INVENTORY");
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new DomainError(422, "Source and destination warehouses must be different.", "SAME_WAREHOUSE");
  }
  const transferDate = parsePostingDate(input.transferDate, "transfer date");

  return withSerializableRetry(async (tx) => {
    const source = await requireWarehouseAccess(tx, actor, input.fromWarehouseId);
    const destination = await requireWarehouseAccess(tx, actor, input.toWarehouseId);
    if (source.warehouseType !== "COMPANY" || destination.warehouseType !== "COMPANY") {
      throw new DomainError(
        422,
        "Stock transfers are for company warehouses only. Distributor stock enters through primary sales.",
        "INVALID_TRANSFER_WAREHOUSE",
      );
    }

    const productIds = [...new Set(input.items.map((item) => item.productId))];
    if (productIds.length !== input.items.length) {
      throw new DomainError(422, "Combine duplicate products into one transfer line.", "DUPLICATE_TRANSFER_ITEM");
    }
    const products = await tx.product.findMany({ where: { id: { in: productIds }, active: true } });
    if (products.length !== productIds.length) throw new DomainError(422, "Select active products only.", "INVALID_PRODUCT");
    const productMap = new Map(products.map((row) => [row.id, row]));

    for (const item of input.items) {
      const product = productMap.get(item.productId)!;
      assertWarehouseAcceptsProduct(destination, product);
      await requireSufficientStock(tx, source.id, product.id, decimal(item.quantity));
    }

    const transferNumber = await nextDocumentNumber(tx, "stock-transfer", "TRF", transferDate);
    const transfer = await tx.stockTransfer.create({
      data: {
        transferNumber,
        fromWarehouseId: source.id,
        toWarehouseId: destination.id,
        transferDate,
        notes: input.notes,
        createdById: actor.id,
        items: {
          create: input.items.map((item) => ({
            productId: item.productId,
            quantity: decimal(item.quantity),
            unitCost: item.unitCost ?? productMap.get(item.productId)!.standardCost,
          })),
        },
      },
      include: { items: true },
    });

    for (const item of transfer.items) {
      const common = {
        productId: item.productId,
        unitCost: item.unitCost,
        referenceType: "STOCK_TRANSFER",
        referenceId: transfer.id,
        movementDate: transferDate,
      };

      // Consume FIFO by expiry at the source, then re-create each batch at the
      // destination under the same batch number and expiry. This is what keeps
      // batch traceability across a transfer, and is the same pairing the
      // primary-sale flow uses when stock lands in a distributor warehouse.
      const { allocations, unbatchedQuantity } = await consumeStock(tx, {
        ...common,
        warehouseId: source.id,
        movementType: "TRANSFER_OUT",
        quantity: item.quantity,
      });

      for (const allocation of allocations) {
        await receiveStock(tx, {
          ...common,
          warehouseId: destination.id,
          movementType: "TRANSFER_IN",
          quantity: allocation.quantity,
          batch: {
            batchNumber: allocation.batch.batchNumber,
            manufacturingDate: allocation.batch.manufacturingDate,
            expiryDate: allocation.batch.expiryDate,
          },
        });
      }
      // Stock that predates batch tracking (opening balances, adjustments)
      // moves across without a batch, exactly as it sat at the source.
      if (unbatchedQuantity.gt(0)) {
        await receiveStock(tx, {
          ...common,
          warehouseId: destination.id,
          movementType: "TRANSFER_IN",
          quantity: unbatchedQuantity,
        });
      }
    }

    await writeAudit(tx, actor, {
      action: "POST",
      entityType: "StockTransfer",
      entityId: transfer.id,
      after: transfer,
    });
    return { id: transfer.id, transferNumber };
  });
}
