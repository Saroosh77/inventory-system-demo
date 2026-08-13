export type PaginationData = {
  page: number;
  pageSize: number;
  total: number;
};

export type ListResponse<T> = {
  data: T[];
  pagination: PaginationData;
};

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  productType: "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOOD";
  supplyType: "PURCHASED" | "MANUFACTURED";
  baseUnit: string;
  salesUnit: string;
  standardCost: number | null;
  defaultPrice: number;
  active: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type StockBalanceRow = {
  warehouse: {
    id: string;
    name: string;
    shortName: string;
    warehouseType: "COMPANY" | "DISTRIBUTOR";
    city: string;
  };
  product: {
    id: string;
    sku: string;
    name: string;
    productType: string;
    supplyType: string;
    baseUnit: string;
  };
  quantity: number;
  quantityOnHand: number;
  reservedQuantity: number;
  availableQuantity: number;
  version: number;
  standardCost: number | null;
  stockValue: number | null;
};

export type StockMovementRow = {
  id: string;
  movementDate: string;
  movementType: string;
  product: {
    id: string;
    sku: string;
    name: string;
    baseUnit: string;
  };
  warehouse: { id: string; name: string; shortName: string };
  batch: { id: string; batchNumber: string } | null;
  quantityIn: number;
  quantityOut: number;
  unitCost: number | null;
  referenceType: string;
  referenceId: string;
  notes: string | null;
};

export type StockBatchRow = {
  id: string;
  batchNumber: string;
  product: {
    id: string;
    sku: string;
    name: string;
    baseUnit: string;
  };
  warehouse: { id: string; name: string; shortName: string };
  manufacturingDate: string | null;
  expiryDate: string;
  quantity: number;
  status: string;
};
