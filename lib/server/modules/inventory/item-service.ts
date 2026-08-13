import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, can, visibleProductTypes, type Actor } from "@/lib/server/access-control";
import { writeAudit } from "@/lib/server/platform/audit-service";
import { DomainError } from "@/lib/server/platform/domain-error";
import { withSerializableRetry } from "@/lib/server/platform/transaction";
import type {
  CreateItemInput,
  ItemListQuery,
  UpdateItemInput,
} from "./inventory-validation";

function validateProductClassification(input: {
  productType: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOOD";
  supplyType: "PURCHASED" | "MANUFACTURED";
}) {
  if (input.supplyType === "MANUFACTURED" && input.productType !== "FINISHED_GOOD") {
    throw new DomainError(
      422,
      "Only finished goods can be marked as manufactured in this version.",
      "INVALID_PRODUCT_CLASSIFICATION",
    );
  }
  if (input.supplyType === "PURCHASED" && input.productType === "FINISHED_GOOD") {
    throw new DomainError(
      422,
      "Finished goods can only be marked as manufactured in this version.",
      "INVALID_PRODUCT_CLASSIFICATION",
    );
  }

}

function itemDto(
  row: {
    id: string;
    sku: string;
    name: string;
    productType: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOOD";
    supplyType: "PURCHASED" | "MANUFACTURED";
    baseUnit: string;
    unit: string;
    standardCost: number;
    defaultPrice: number;
    active: boolean;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  },
  includeCost: boolean,
) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    productType: row.productType,
    supplyType: row.supplyType,
    baseUnit: row.baseUnit,
    salesUnit: row.unit,
    standardCost: includeCost ? row.standardCost : null,
    defaultPrice: row.defaultPrice,
    active: row.active,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listItems(actor: Actor, query: ItemListQuery) {
  assertPermission(actor, "VIEW_INVENTORY");
  const visibleTypes = visibleProductTypes(actor.role);
  const where: Prisma.ProductWhereInput = {
    productType: query.productType
      ? { equals: query.productType, in: [...visibleTypes] }
      : { in: [...visibleTypes] },
    ...(query.supplyType ? { supplyType: query.supplyType } : {}),
    ...(query.active === "all" ? {} : { active: query.active === "true" }),
    ...(query.search
      ? {
          OR: [
            { sku: { contains: query.search, mode: "insensitive" } },
            { name: { contains: query.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ name: "asc" }, { sku: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  const includeCost = can(actor.role, "VIEW_INVENTORY_COST");

  return {
    data: rows.map((row) => itemDto(row, includeCost)),
    pagination: { page: query.page, pageSize: query.pageSize, total },
  };
}

export async function getItem(actor: Actor, id: string) {
  assertPermission(actor, "VIEW_INVENTORY");
  const row = await prisma.product.findFirst({
    where: { id, productType: { in: [...visibleProductTypes(actor.role)] } },
  });
  if (!row) throw new DomainError(404, "Inventory item not found.", "ITEM_NOT_FOUND");
  return itemDto(row, can(actor.role, "VIEW_INVENTORY_COST"));
}

export async function createItem(actor: Actor, input: CreateItemInput) {
  assertPermission(actor, "MANAGE_INVENTORY_ITEMS");
  validateProductClassification(input);

  return withSerializableRetry(async (tx) => {
    const row = await tx.product.create({
      data: {
        sku: input.sku,
        name: input.name,
        productType: input.productType,
        supplyType: input.supplyType,
        baseUnit: input.baseUnit,
        unit: input.salesUnit ?? input.baseUnit.toLowerCase(),
        standardCost: input.standardCost,
        defaultPrice: input.defaultPrice,
      },
    });
    await writeAudit(tx, actor, {
      action: "CREATE",
      entityType: "Product",
      entityId: row.id,
      after: row,
    });
    return itemDto(row, true);
  });
}

export async function updateItem(actor: Actor, id: string, input: UpdateItemInput) {
  assertPermission(actor, "MANAGE_INVENTORY_ITEMS");

  return withSerializableRetry(async (tx) => {
    const before = await tx.product.findUnique({ where: { id } });
    if (!before) throw new DomainError(404, "Inventory item not found.", "ITEM_NOT_FOUND");

    const productType = input.productType ?? before.productType;
    const supplyType = input.supplyType ?? before.supplyType;
    validateProductClassification({ productType, supplyType });

    const data: Prisma.ProductUpdateManyMutationInput = {
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.productType !== undefined ? { productType: input.productType } : {}),
      ...(input.supplyType !== undefined ? { supplyType: input.supplyType } : {}),
      ...(input.baseUnit !== undefined ? { baseUnit: input.baseUnit } : {}),
      ...(input.salesUnit !== undefined ? { unit: input.salesUnit } : {}),
      ...(input.standardCost !== undefined ? { standardCost: input.standardCost } : {}),
      ...(input.defaultPrice !== undefined ? { defaultPrice: input.defaultPrice } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      version: { increment: 1 },
    };

    const updated = await tx.product.updateMany({
      where: { id, version: input.expectedVersion },
      data,
    });
    if (updated.count !== 1) {
      throw new DomainError(
        409,
        "This item was changed by another user. Reload it and try again.",
        "STALE_VERSION",
      );
    }

    const after = await tx.product.findUniqueOrThrow({ where: { id } });
    await writeAudit(tx, actor, {
      action: "UPDATE",
      entityType: "Product",
      entityId: id,
      before,
      after,
    });
    return itemDto(after, true);
  });
}
