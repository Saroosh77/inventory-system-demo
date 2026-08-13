import { Prisma, ProductType } from "@prisma/client";
import { prisma } from "../../../db";
import type { WorkspaceData } from "../../../erp/types";
import {
  assertPermission,
  can,
  type Actor,
  type Permission,
  visibleProductTypes,
} from "../../access-control";
import { isCompanyFinancialSale } from "../../business-rules";
import { balanceSheet, trialBalance, type BalanceSheet, type TrialBalanceRow } from "../ledger/ledger-reports";

function dateOnly(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? null;
}

// WAREHOUSE_STAFF sees only invoices raised out of their own warehouse; the
// finance and admin roles see the whole register.
function invoiceScopedWhere(actor: Actor): Prisma.InvoiceWhereInput {
  if (actor.role === "WAREHOUSE_STAFF")
    return { warehouseId: actor.warehouseId ?? "__unassigned__" };
  return {};
}

export type WorkspaceSection =
  | "dashboard"
  | "invoices"
  | "inventory"
  | "reports";

export async function loadSession(actor: Actor) {
  const { rolePermissions } = await import("../../access-control");
  return {
    actor,
    permissions: [...rolePermissions[actor.role]],
  };
}

export type WorkspaceDateRange = { from: Date | null; to: Date | null };

export async function loadWorkspace(
  section: WorkspaceSection,
  actor: Actor,
  dateRange?: WorkspaceDateRange,
): Promise<WorkspaceData> {
  // Only Reports is filterable by date; Dashboard stays unscoped (all-time),
  // so this is threaded through as an optional filter rather than a parameter
  // every caller has to supply.
  const reportDateFilter =
    section === "reports" && dateRange && (dateRange.from || dateRange.to)
      ? {
          ...(dateRange.from ? { gte: dateRange.from } : {}),
          ...(dateRange.to ? { lte: dateRange.to } : {}),
        }
      : null;
  const sectionPermission: Record<WorkspaceSection, Permission> = {
    dashboard: "VIEW_DASHBOARD",
    invoices: "VIEW_INVOICES",
    inventory: "VIEW_INVENTORY",
    reports: "VIEW_PNL",
  };
  assertPermission(actor, sectionPermission[section]);

  const productTypes = visibleProductTypes(actor.role);
  const warehouseFilter =
    actor.role === "WAREHOUSE_STAFF" && actor.warehouseId
      ? { id: actor.warehouseId }
      : {};
  const invoiceFilter = invoiceScopedWhere(actor);
  // Gated on the permission, not just the section: the dashboard is open to
  // every role, but a role that cannot open the invoice register must not
  // receive sales and receivable figures in its payload either. Masking these
  // in the UI alone would leave them readable straight off the API.
  const needsTotals =
    ["dashboard", "invoices", "reports"].includes(section) &&
    can(actor.role, "VIEW_INVOICES");
  const needsWarehouses = ["dashboard", "inventory"].includes(section);
  const needsProducts = section === "inventory";
  const needsStaff = ["dashboard", "reports"].includes(section);
  const includeCost = can(actor.role, "VIEW_INVENTORY_COST");
  // `staff` is fetched for the dashboard as well as Reports, so masking
  // baseSalary must be independent of section and keyed on its own
  // permission, same reasoning as the standardCost/stockValue masking below.
  const canViewSalary = can(actor.role, "VIEW_STAFF_SALARY");
  // totals is row-scoped per actor via financialScope, but the margin-shaped
  // fields within it (companyCogs sums unitCostSnapshot, i.e. cost basis) are
  // cost data like standardCost/stockValue above, not revenue data — masked
  // independently of section for the same reason.
  const canViewPnl = can(actor.role, "VIEW_PNL");
  const needsRoutes = section === "reports";
  // Distributors are cheap regardless and Reports needs them for the
  // by-distributor breakdown.
  const needsDistributors = section === "reports";

  const [
    warehouses,
    distributors,
    products,
    staff,
    routes,
    invoices,
    movements,
    nearExpiryRows,
  ] = await Promise.all([
    needsWarehouses
      ? prisma.warehouse.findMany({
          where: { active: true, ...warehouseFilter },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    needsDistributors
      ? prisma.distributor.findMany({
          where: { active: true },
          select: { id: true, name: true, cityId: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([] as Array<{ id: string; name: string; cityId: string }>),
    needsProducts
      ? prisma.product.findMany({
          where: { active: true, productType: { in: [...productTypes] } },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    needsStaff
      ? prisma.staff.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    needsRoutes
      ? prisma.route.findMany({
          where: { active: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    (section === "invoices" ||
      (section === "dashboard" && can(actor.role, "VIEW_PNL"))) &&
    can(actor.role, "VIEW_INVOICES")
      ? prisma.invoice.findMany({
          where: invoiceFilter,
          take: section === "dashboard" ? 8 : 150,
          orderBy: [{ invoiceDate: "desc" }, { createdAt: "desc" }],
          include: {
            customer: true,
            warehouse: true,
            booker: true,
            items: true,
          },
        })
      : Promise.resolve([]),
    ["dashboard", "inventory"].includes(section) &&
    can(actor.role, "VIEW_INVENTORY")
      ? prisma.stockMovement.groupBy({
          by: ["warehouseId", "productId", "unitCost"],
          where: {
            product: { productType: { in: [...productTypes] } },
            ...(actor.role === "WAREHOUSE_STAFF"
              ? { warehouseId: actor.warehouseId ?? "__unassigned__" }
              : {}),
          },
          _sum: { quantityIn: true, quantityOut: true },
        })
      : Promise.resolve(
          [] as Array<{
            warehouseId: string;
            productId: string;
            unitCost: number;
            _sum: { quantityIn: number | null; quantityOut: number | null };
          }>,
        ),
    ["dashboard", "inventory"].includes(section) &&
    can(actor.role, "VIEW_INVENTORY")
      ? prisma.stockBatch.groupBy({
          by: ["warehouseId"],
          where: {
            status: "ACTIVE",
            product: { productType: { in: [...productTypes] } },
            expiryDate: {
              gte: new Date(),
              lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            },
            ...(actor.role === "WAREHOUSE_STAFF"
              ? { warehouseId: actor.warehouseId ?? "__unassigned__" }
              : {}),
          },
          _count: { _all: true },
        })
      : Promise.resolve([]),
  ]);

  // The dashboard's warehouse overview needs product names to label stock, but
  // the product list itself is only shipped to the Inventory module. Fetch the
  // lookup separately so the dashboard payload stays small.
  const productLookupRows = ["dashboard", "inventory"].includes(section)
    ? await prisma.product.findMany({
        where: { productType: { in: [...productTypes] } },
        select: {
          id: true,
          name: true,
          sku: true,
          productType: true,
          standardCost: true,
        },
      })
    : [];

  const stockMap = new Map<string, { quantity: number; stockValue: number }>();
  const productStockMap = new Map<
    string,
    {
      warehouseId: string;
      productId: string;
      name: string;
      sku: string;
      productType: ProductType;
      quantity: number;
      stockValue: number;
    }
  >();
  const productLookup = new Map(
    productLookupRows.map((product) => [product.id, product]),
  );
  for (const movement of movements) {
    const current = stockMap.get(movement.warehouseId) ?? {
      quantity: 0,
      stockValue: 0,
    };
    const quantity =
      Number(movement._sum.quantityIn ?? 0) -
      Number(movement._sum.quantityOut ?? 0);
    const product = productLookup.get(movement.productId);
    current.quantity += quantity;
    current.stockValue +=
      quantity * (movement.unitCost || product?.standardCost || 0);
    stockMap.set(movement.warehouseId, current);
    if (!product) continue;
    const productKey = `${movement.warehouseId}:${movement.productId}`;
    const productCurrent = productStockMap.get(productKey) ?? {
      warehouseId: movement.warehouseId,
      productId: movement.productId,
      name: product.name,
      sku: product.sku,
      productType: product.productType,
      quantity: 0,
      stockValue: 0,
    };
    productCurrent.quantity += quantity;
    productCurrent.stockValue +=
      quantity * (movement.unitCost || product.standardCost);
    productStockMap.set(productKey, productCurrent);
  }

  const financialScope: Prisma.InvoiceWhereInput =
    actor.role === "WAREHOUSE_STAFF"
      ? { warehouseId: actor.warehouseId ?? "__unassigned__" }
      : {};
  const allFinancialInvoices = needsTotals
    ? await prisma.invoice.findMany({
        where: {
          status: { not: "CANCELLED" },
          ...financialScope,
          ...(reportDateFilter ? { invoiceDate: reportDateFilter } : {}),
        },
        select: {
          salesType: true,
          invoiceDate: true,
          taxableAmount: true,
          taxAmount: true,
          netAmount: true,
          paidAmount: true,
          balanceAmount: true,
          bookerId: true,
          distributorId: true,
          routeId: true,
          items: { select: { quantity: true, unitCostSnapshot: true } },
        },
      })
    : [];
  const totals = allFinancialInvoices.reduce(
    (summary, invoice) => {
      if (invoice.salesType === "PRIMARY")
        summary.primarySales += invoice.taxableAmount;
      if (invoice.salesType === "SECONDARY")
        summary.secondarySales += invoice.taxableAmount;
      if (invoice.salesType === "DIRECT")
        summary.directSales += invoice.taxableAmount;
      summary.totalSales += invoice.taxableAmount;
      summary.totalRecovered += invoice.paidAmount;
      summary.totalOutstanding += invoice.balanceAmount;
      if (isCompanyFinancialSale(invoice.salesType)) {
        summary.companyRevenue += invoice.taxableAmount;
        summary.companyCogs += invoice.items.reduce(
          (sum, item) => sum + item.quantity * item.unitCostSnapshot,
          0,
        );
        summary.outputTax += invoice.taxAmount;
      }
      return summary;
    },
    {
      primarySales: 0,
      secondarySales: 0,
      directSales: 0,
      totalSales: 0,
      totalRecovered: 0,
      totalOutstanding: 0,
      companyRevenue: 0,
      companyCogs: 0,
      outputTax: 0,
    },
  );

  // Weekly primary/secondary/direct trend for the dashboard chart, bucketed
  // from the same allFinancialInvoices fetch used for `totals` above rather
  // than a separate query.
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const salesTrend =
    section === "dashboard"
      ? (() => {
          const now = new Date();
          const buckets = new Map<
            number,
            { primary: number; secondary: number; direct: number }
          >();
          for (const invoice of allFinancialInvoices) {
            const weeksAgo = Math.floor(
              (now.getTime() - invoice.invoiceDate.getTime()) / weekMs,
            );
            if (weeksAgo < 0 || weeksAgo > 7) continue;
            const bucket = buckets.get(weeksAgo) ?? {
              primary: 0,
              secondary: 0,
              direct: 0,
            };
            if (invoice.salesType === "PRIMARY")
              bucket.primary += invoice.taxableAmount;
            if (invoice.salesType === "SECONDARY")
              bucket.secondary += invoice.taxableAmount;
            if (invoice.salesType === "DIRECT")
              bucket.direct += invoice.taxableAmount;
            buckets.set(weeksAgo, bucket);
          }
          return Array.from({ length: 8 }, (_, index) => {
            const weeksAgo = 7 - index;
            const bucket = buckets.get(weeksAgo) ?? {
              primary: 0,
              secondary: 0,
              direct: 0,
            };
            const weekStart = new Date(now.getTime() - weeksAgo * weekMs);
            return {
              weekLabel: weekStart.toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
              }),
              ...bucket,
            };
          });
        })()
      : [];

  // Sales counts and amounts for the performance breakdowns below are derived
  // from allFinancialInvoices (already fetched for `totals`, and already
  // date-scoped by reportDateFilter) rather than issued as separate queries
  // per booker/distributor/route.
  function invoiceSummaryBy(key: "bookerId" | "distributorId" | "routeId") {
    const summary = new Map<string, { invoicesPosted: number; salesAmount: number }>();
    for (const invoice of allFinancialInvoices) {
      const id = invoice[key];
      if (!id) continue;
      const row = summary.get(id) ?? { invoicesPosted: 0, salesAmount: 0 };
      row.invoicesPosted += 1;
      row.salesAmount += invoice.taxableAmount;
      summary.set(id, row);
    }
    return summary;
  }

  const runsReports = section === "reports";
  const paymentDateFilter = reportDateFilter
    ? { paymentDate: reportDateFilter }
    : {};

  const bookerInvoiceSummary = invoiceSummaryBy("bookerId");
  // Full roster only for privileged viewers (Reports/VIEW_PNL) — a plain-role
  // actor viewing their own dashboard must not see every other staff member's
  // individual sales/recovery figures, only their own.
  const staffForPerformance =
    runsReports || canViewPnl
      ? staff
      : staff.filter((person) => person.id === actor.staffId);
  const staffPerformance =
    runsReports || section === "dashboard"
      ? await Promise.all(
          staffForPerformance.map(async (person) => {
            const recovery = await prisma.payment.aggregate({
              where: { collectedById: person.id, ...paymentDateFilter },
              _sum: { amount: true },
            });
            const invoiced = bookerInvoiceSummary.get(person.id);
            return {
              staffId: person.id,
              invoicesPosted: invoiced?.invoicesPosted ?? 0,
              salesAmount: invoiced?.salesAmount ?? 0,
              recovery: recovery._sum.amount ?? 0,
            };
          }),
        )
      : [];

  // Distributor and route breakdowns exist only for Reports — they are the two
  // other groupings the P&L boundary (see business-rules.ts) is reported by.
  const distributorInvoiceSummary = invoiceSummaryBy("distributorId");
  const distributorPerformance = runsReports
    ? await Promise.all(
        distributors.map(async (distributor) => {
          const recovery = await prisma.payment.aggregate({
            where: { distributorId: distributor.id, ...paymentDateFilter },
            _sum: { amount: true },
          });
          const invoiced = distributorInvoiceSummary.get(distributor.id);
          return {
            distributorId: distributor.id,
            invoicesPosted: invoiced?.invoicesPosted ?? 0,
            salesAmount: invoiced?.salesAmount ?? 0,
            recovery: recovery._sum.amount ?? 0,
          };
        }),
      )
    : [];

  const routeInvoiceSummary = invoiceSummaryBy("routeId");
  const routePerformance = runsReports
    ? await Promise.all(
        routes.map(async (route) => {
          const [recovery, assignedCustomers] = await Promise.all([
            prisma.payment.aggregate({
              where: { routeId: route.id, ...paymentDateFilter },
              _sum: { amount: true },
            }),
            prisma.customer.count({
              where: { routeId: route.id, active: true },
            }),
          ]);
          const invoiced = routeInvoiceSummary.get(route.id);
          return {
            routeId: route.id,
            invoicesPosted: invoiced?.invoicesPosted ?? 0,
            salesAmount: invoiced?.salesAmount ?? 0,
            recovery: recovery._sum.amount ?? 0,
            assignedCustomers,
          };
        }),
      )
    : [];

  // Trial balance and balance sheet are point-in-time snapshots, not
  // period-ranged like the P&L above, so they use only the "to" bound of
  // the report date filter (or "as of now" when unset) rather than a range.
  const ledgerAsOf = dateOnly(dateRange?.to ?? null) ?? undefined;
  const emptyTrialBalance = { rows: [] as TrialBalanceRow[], totalDebit: 0, totalCredit: 0 };
  const emptyBalanceSheet: BalanceSheet = {
    asOf: null,
    assets: { rows: [], total: 0 },
    liabilities: { rows: [], total: 0 },
    equity: { rows: [], total: 0 },
    currentPeriodEarnings: 0,
    totalLiabilitiesAndEquity: 0,
  };
  const [ledgerTrialBalance, ledgerBalanceSheet] = runsReports
    ? await Promise.all([
        trialBalance(actor, { asOf: ledgerAsOf }),
        balanceSheet(actor, { asOf: ledgerAsOf }),
      ])
    : [emptyTrialBalance, emptyBalanceSheet];

  return {
    actor,
    permissions: [
      ...(await import("../../access-control")).rolePermissions[actor.role],
    ],
    cities: [],
    warehouses: warehouses.map((row) => ({
      id: row.id,
      name: row.name,
      shortName: row.shortName,
      cityId: row.cityId,
      warehouseType: row.warehouseType,
      distributorId: row.distributorId,
    })),
    distributors: distributors.map(({ id, name, cityId }) => ({
      id,
      name,
      cityId,
    })),
    customers: [],
    products: products.map((row) => ({
      id: row.id,
      name: row.name,
      sku: row.sku,
      productType: row.productType,
      unit: row.unit,
      defaultPrice: row.defaultPrice,
      standardCost: includeCost ? row.standardCost : null,
    })),
    staff: staff.map((row) => ({
      id: row.id,
      name: row.name,
      employeeCode: row.employeeCode,
      staffRole: row.staffRole,
      designation: row.designation,
      baseSalary: canViewSalary ? row.baseSalary : null,
      cityId: row.cityId,
      distributorId: row.distributorId,
      routeId: row.routeId,
    })),
    staffPerformance,
    distributorPerformance,
    routePerformance,
    routes: routes.map((row) => ({
      id: row.id,
      name: row.name,
      cityId: row.cityId,
      distributorId: row.distributorId,
    })),
    invoices: invoices.map((row) => ({
      id: row.id,
      number: row.invoiceNumber,
      date: dateOnly(row.invoiceDate)!,
      dueDate: dateOnly(row.dueDate),
      salesType: row.salesType,
      taxType: row.taxType,
      taxRateBps: row.taxRateBps,
      taxableAmount: row.taxableAmount,
      taxAmount: row.taxAmount,
      customerId: row.customerId,
      customer: row.customer.name,
      warehouseId: row.warehouseId,
      warehouse: row.warehouse.shortName,
      bookerId: row.bookerId,
      booker: row.booker?.name ?? "Unassigned",
      routeId: row.routeId,
      netAmount: row.netAmount,
      paidAmount: row.paidAmount,
      balanceAmount: row.balanceAmount,
      status: row.status,
      deliveryStatus: row.deliveryStatus,
    })),
    stock: warehouses.map((warehouse) => ({
      id: warehouse.id,
      name: warehouse.name,
      shortName: warehouse.shortName,
      cityId: warehouse.cityId,
      warehouseType: warehouse.warehouseType,
      quantity: stockMap.get(warehouse.id)?.quantity ?? 0,
      stockValue: includeCost
        ? (stockMap.get(warehouse.id)?.stockValue ?? 0)
        : null,
    })),
    stockByProduct: [...productStockMap.values()].map((row) => ({
      ...row,
      stockValue: includeCost ? row.stockValue : null,
    })),
    totals: {
      ...totals,
      companyRevenue: canViewPnl ? totals.companyRevenue : null,
      companyCogs: canViewPnl ? totals.companyCogs : null,
      companyGrossProfit: canViewPnl
        ? totals.companyRevenue - totals.companyCogs
        : null,
      outputTax: canViewPnl ? totals.outputTax : null,
    },
    nearExpiry: nearExpiryRows.map((row) => ({
      warehouseId: row.warehouseId,
      count: row._count._all,
    })),
    ledger: {
      trialBalance: ledgerTrialBalance,
      balanceSheet: ledgerBalanceSheet,
    },
    salesTrend,
  };
}
