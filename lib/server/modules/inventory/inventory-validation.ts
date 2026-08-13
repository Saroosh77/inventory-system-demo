import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.");
const quantity = z.coerce.number().positive().max(999_999_999);
const money = z.coerce.number().int().min(0).max(2_000_000_000);

export const productTypeSchema = z.enum(["RAW_MATERIAL", "PACKAGING", "FINISHED_GOOD"]);
export const supplyTypeSchema = z.enum(["PURCHASED", "MANUFACTURED"]);
export const unitOfMeasureSchema = z.enum([
  "GRAM",
  "KILOGRAM",
  "MILLILITRE",
  "LITRE",
  "PIECE",
  "PACKET",
  "CARTON",
  "BAG",
]);

export const itemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(120).optional(),
  productType: productTypeSchema.optional(),
  supplyType: supplyTypeSchema.optional(),
  active: z.enum(["true", "false", "all"]).default("true"),
});

export const createItemSchema = z.object({
  sku: z.string().trim().min(2).max(40),
  name: z.string().trim().min(2).max(120),
  productType: productTypeSchema,
  supplyType: supplyTypeSchema,
  baseUnit: unitOfMeasureSchema,
  salesUnit: z.string().trim().min(1).max(30).optional(),
  standardCost: money.default(0),
  defaultPrice: money.default(0),
});

export const updateItemSchema = createItemSchema.partial().extend({
  expectedVersion: z.coerce.number().int().positive(),
  active: z.boolean().optional(),
}).refine(
  (value) => Object.keys(value).some((key) => key !== "expectedVersion"),
  "Provide at least one field to update.",
);

export const stockQuerySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  search: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const batchQuerySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  status: z.enum(["ACTIVE", "EXPIRED", "RECALLED"]).optional(),
  expiringBefore: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const movementQuerySchema = z.object({
  warehouseId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  referenceType: z.string().trim().max(60).optional(),
  dateFrom: isoDate.optional(),
  dateTo: isoDate.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export const createAdjustmentSchema = z.object({
  warehouseId: z.string().min(1),
  adjustmentDate: isoDate,
  reason: z.string().trim().min(5).max(300),
  items: z.array(z.object({
    productId: z.string().min(1),
    batchId: z.string().min(1).nullable().optional(),
    direction: z.enum(["IN", "OUT"]),
    quantity,
    unitCost: money.optional(),
  })).min(1).max(100),
});

export const createTransferSchema = z.object({
  fromWarehouseId: z.string().min(1),
  toWarehouseId: z.string().min(1),
  transferDate: isoDate,
  notes: z.string().trim().max(500).optional(),
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity,
    unitCost: money.optional(),
  })).min(1).max(100),
});

export type ItemListQuery = z.infer<typeof itemListQuerySchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type StockQuery = z.infer<typeof stockQuerySchema>;
export type BatchQuery = z.infer<typeof batchQuerySchema>;
export type MovementQuery = z.infer<typeof movementQuerySchema>;
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>;
export type CreateTransferInput = z.infer<typeof createTransferSchema>;
