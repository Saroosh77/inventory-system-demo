export type SalesType = "PRIMARY" | "SECONDARY" | "DIRECT";
export type WarehouseType = "COMPANY" | "DISTRIBUTOR";
export type TaxType = "GST" | "NON_GST";
export type UserRole = "ADMIN" | "FINANCE" | "WAREHOUSE_STAFF";
export type ProductType = "RAW_MATERIAL" | "PACKAGING" | "FINISHED_GOOD";

export type NamedEntity = { id: string; name: string };
export type Actor = NamedEntity & { email: string; role: UserRole; staffId: string | null; warehouseId: string | null };

export type WorkspaceWarehouse = NamedEntity & {
  shortName: string;
  cityId: string;
  warehouseType: WarehouseType;
  distributorId: string | null;
};

export type WorkspaceCustomer = NamedEntity & {
  customerType: "DISTRIBUTOR" | "RETAILER";
  cityId: string;
  distributorId: string | null;
  routeId: string | null;
  assignedBookerId: string | null;
  creditLimit: number;
  creditDays: number;
  openingBalance: number;
  taxRegistered: boolean;
};

export type WorkspaceProduct = NamedEntity & {
  sku: string;
  productType: ProductType;
  unit: string;
  defaultPrice: number;
  standardCost: number | null;
};

export type WorkspaceStaff = NamedEntity & {
  employeeCode: string | null;
  staffRole: "SALESPERSON" | "BOOKER" | "RECOVERY" | "DELIVERY" | "WAREHOUSE" | "FINANCE" | "ADMINISTRATION";
  designation: string | null;
  baseSalary: number | null;
  cityId: string;
  distributorId: string | null;
  routeId: string | null;
};

export type WorkspaceRoute = NamedEntity & { cityId: string; distributorId: string | null };

export type WorkspaceInvoice = {
  id: string;
  number: string;
  date: string;
  dueDate: string | null;
  salesType: SalesType;
  taxType: TaxType;
  taxRateBps: number;
  taxableAmount: number;
  taxAmount: number;
  customerId: string;
  customer: string;
  warehouseId: string;
  warehouse: string;
  bookerId: string | null;
  booker: string;
  routeId: string | null;
  netAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: string;
  deliveryStatus: string;
};

export type WorkspaceStock = {
  id: string;
  name: string;
  shortName: string;
  cityId: string;
  warehouseType: WarehouseType;
  quantity: number;
  /** Null when the actor lacks VIEW_INVENTORY_COST. */
  stockValue: number | null;
};

export type LedgerAccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";

export type LedgerAccountRow = {
  accountId: string;
  code: string;
  name: string;
  type: LedgerAccountType;
  debit: number;
  credit: number;
};

export type LedgerSection = { rows: LedgerAccountRow[]; total: number };

export type WorkspaceLedger = {
  trialBalance: { rows: LedgerAccountRow[]; totalDebit: number; totalCredit: number };
  balanceSheet: {
    asOf: string | null;
    assets: LedgerSection;
    liabilities: LedgerSection;
    equity: LedgerSection;
    currentPeriodEarnings: number;
    totalLiabilitiesAndEquity: number;
  };
};

export type WorkspaceData = {
  actor: Actor;
  permissions: string[];
  cities: NamedEntity[];
  warehouses: WorkspaceWarehouse[];
  distributors: Array<NamedEntity & { cityId: string }>;
  customers: WorkspaceCustomer[];
  products: WorkspaceProduct[];
  staff: WorkspaceStaff[];
  staffPerformance: Array<{
    staffId: string;
    invoicesPosted: number;
    salesAmount: number;
    recovery: number;
  }>;
  distributorPerformance: Array<{
    distributorId: string;
    invoicesPosted: number;
    salesAmount: number;
    recovery: number;
  }>;
  routePerformance: Array<{
    routeId: string;
    invoicesPosted: number;
    salesAmount: number;
    recovery: number;
    assignedCustomers: number;
  }>;
  routes: WorkspaceRoute[];
  invoices: WorkspaceInvoice[];
  stock: WorkspaceStock[];
  stockByProduct: Array<{ warehouseId: string; productId: string; name: string; sku: string; productType: string; quantity: number; stockValue: number | null }>;
  totals: {
    primarySales: number;
    secondarySales: number;
    directSales: number;
    totalSales: number;
    totalRecovered: number;
    totalOutstanding: number;
    companyRevenue: number | null;
    companyCogs: number | null;
    companyGrossProfit: number | null;
    outputTax: number | null;
  };
  nearExpiry: Array<{ warehouseId: string; count: number }>;
  ledger: WorkspaceLedger;
  salesTrend: Array<{ weekLabel: string; primary: number; secondary: number; direct: number }>;
};

export type ErpAction = { action: "cancelInvoice"; invoiceId: string; reason: string };

export type City = NamedEntity;
