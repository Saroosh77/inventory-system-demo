/**
 * Demo data set.
 *
 * Everything below is invented. There is no real customer, employee, price or
 * balance in this file — it exists so the five demo modules (Dashboard,
 * Inventory, Invoices, Reports, Administration) can be shown against data that
 * behaves like a live business.
 *
 * Two properties matter more than volume:
 *
 *  - It is *internally consistent*. Stock is moved through the same
 *    receiveStock/consumeStock primitives the application uses, so every
 *    balance shown in Inventory is the sum of its own movements, and every
 *    invoice posts through postJournalEntry, so the trial balance actually
 *    balances and the balance sheet ties out.
 *  - It is *dated relative to today*. Everything is generated backwards from
 *    the run date, so the demo never looks stale no matter when it is shown.
 *
 * Re-running is safe: the operational tables are truncated first.
 */
import { PrismaClient, Prisma } from "@prisma/client";
import type { Actor } from "../lib/server/access-control";
import { hashPassword } from "../lib/server/auth/password";
import { calculateInvoice } from "../lib/server/business-rules";
import { nextDocumentNumber } from "../lib/server/platform/number-service";
import {
  consumeStock,
  receiveStock,
} from "../lib/server/modules/inventory/stock-ledger";
import { ACCOUNT_CODES, CHART_OF_ACCOUNTS } from "../lib/server/modules/ledger/chart-of-accounts";
import { postJournalEntry } from "../lib/server/modules/ledger/ledger-service";
import {
  customerPaymentLines,
  inventoryAdjustmentLines,
  salesCogsLines,
  salesInvoiceLines,
} from "../lib/server/modules/ledger/ledger-rules";
import { pakistanCities } from "./data/pakistan-cities";

const prisma = new PrismaClient();

const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD ?? "DemoPass!2026";

/** Days of history the demo generates behind today. */
const HISTORY_DAYS = 130;

// ---------------------------------------------------------------------------
// Deterministic randomness
//
// A fixed-seed linear congruential generator, so every run of the seed
// produces the identical data set. A demo that reshuffles itself between runs
// is impossible to rehearse against.
// ---------------------------------------------------------------------------
let randomState = 20260813;
function random() {
  randomState = (randomState * 1664525 + 1013904223) % 4294967296;
  return randomState / 4294967296;
}
function randomInt(min: number, max: number) {
  return min + Math.floor(random() * (max - min + 1));
}
function pick<T>(values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}
function chance(probability: number) {
  return random() < probability;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TODAY = new Date(
  Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  ),
);
function daysAgo(days: number) {
  return new Date(TODAY.getTime() - days * DAY_MS);
}
function daysAhead(days: number) {
  return new Date(TODAY.getTime() + days * DAY_MS);
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
const TABLES = [
  "JournalLine",
  "JournalEntry",
  "Account",
  "AuditLog",
  "StockMovement",
  "StockBalance",
  "StockBatch",
  "StockTransferItem",
  "StockTransfer",
  "InventoryAdjustmentItem",
  "InventoryAdjustment",
  "Payment",
  "InvoiceItem",
  "Invoice",
  "Customer",
  "Product",
  "AuthSession",
  "LoginThrottle",
  "User",
  "Staff",
  "Route",
  "Territory",
  "Warehouse",
  "Distributor",
  "City",
  "Counter",
];

async function reset() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
const FINISHED_GOODS = [
  { sku: "FG-BBQ-050", name: "BBQ Masala 50g", cost: 1_100, price: 1_500 },
  { sku: "FG-CHK-050", name: "Chicken Masala 50g", cost: 1_000, price: 1_425 },
  { sku: "FG-TIK-050", name: "Tikka Masala 50g", cost: 1_050, price: 1_475 },
  { sku: "FG-BIR-100", name: "Biryani Masala 100g", cost: 1_350, price: 1_850 },
  { sku: "FG-KAR-100", name: "Karahi Masala 100g", cost: 1_300, price: 1_780 },
  { sku: "FG-CHT-050", name: "Chaat Masala 50g", cost: 900, price: 1_250 },
  { sku: "FG-HAL-200", name: "Haleem Mix 200g", cost: 1_600, price: 2_200 },
  { sku: "FG-KOR-100", name: "Korma Masala 100g", cost: 1_250, price: 1_700 },
  { sku: "FG-NIH-100", name: "Nihari Masala 100g", cost: 1_400, price: 1_900 },
  { sku: "FG-PUL-100", name: "Pulao Masala 100g", cost: 1_150, price: 1_600 },
  { sku: "FG-CHL-500", name: "Chilli Powder 500g", cost: 1_800, price: 2_450 },
  { sku: "FG-TUR-500", name: "Turmeric Powder 500g", cost: 1_200, price: 1_650 },
  { sku: "FG-COR-500", name: "Coriander Powder 500g", cost: 1_100, price: 1_520 },
  { sku: "FG-GAR-100", name: "Garam Masala 100g", cost: 1_500, price: 2_050 },
  { sku: "FG-KET-1000", name: "Tomato Ketchup 1kg", cost: 1_750, price: 2_350 },
  { sku: "FG-VIN-1000", name: "Synthetic Vinegar 1L", cost: 700, price: 980 },
];

const RAW_MATERIALS = [
  { sku: "RM-CHILLI-001", name: "Red Chilli (Whole)", cost: 850 },
  { sku: "RM-TURMERIC-001", name: "Turmeric Root", cost: 620 },
  { sku: "RM-CORIANDER-001", name: "Coriander Seed", cost: 540 },
  { sku: "RM-CUMIN-001", name: "Cumin Seed", cost: 1_450 },
  { sku: "RM-SALT-001", name: "Food Grade Salt", cost: 80 },
  { sku: "RM-TOMATO-001", name: "Tomato Paste Concentrate", cost: 480 },
];

const PACKAGING = [
  { sku: "PK-POUCH-050", name: "50g Printed Pouch", cost: 8 },
  { sku: "PK-POUCH-100", name: "100g Printed Pouch", cost: 11 },
  { sku: "PK-CARTON-STD", name: "Standard Shipper Carton", cost: 45 },
];

async function main() {
  console.log("Resetting demo database…");
  await reset();

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  // --- Chart of accounts -------------------------------------------------
  await prisma.account.createMany({ data: CHART_OF_ACCOUNTS });

  // --- Cities ------------------------------------------------------------
  // The full national city master ships with the demo so the Administration
  // module has a realistically sized, searchable, paginated reference table.
  await prisma.city.createMany({ data: [...pakistanCities], skipDuplicates: true });
  async function cityByName(name: string, province: string) {
    return prisma.city.findFirstOrThrow({ where: { name, province } });
  }
  const karachi = await cityByName("Karachi", "Sindh");
  const lahore = await cityByName("Lahore", "Punjab");
  const islamabad = await cityByName("Islamabad", "Punjab");
  const peshawar = await cityByName("Peshawar", "Khyber Pakhtunkhwa");
  const hyderabad = await cityByName("Hyderabad", "Sindh");

  // --- Distributors ------------------------------------------------------
  const frontier = await prisma.distributor.create({
    data: {
      name: "Frontier Foods Distribution",
      cityId: peshawar.id,
      phone: "0300-1000101",
    },
  });
  const indus = await prisma.distributor.create({
    data: {
      name: "Indus Trade Partners",
      cityId: hyderabad.id,
      phone: "0300-1000202",
    },
  });

  // --- Warehouses --------------------------------------------------------
  const khiWarehouse = await prisma.warehouse.create({
    data: {
      name: "Karachi Central Warehouse",
      shortName: "KHI-CENTRAL",
      cityId: karachi.id,
      warehouseType: "COMPANY",
    },
  });
  const lhrWarehouse = await prisma.warehouse.create({
    data: {
      name: "Lahore Regional Warehouse",
      shortName: "LHR-REGIONAL",
      cityId: lahore.id,
      warehouseType: "COMPANY",
    },
  });
  const islWarehouse = await prisma.warehouse.create({
    data: {
      name: "Islamabad Distributor Warehouse",
      shortName: "ISL-DIST",
      cityId: islamabad.id,
      warehouseType: "DISTRIBUTOR",
      distributorId: frontier.id,
    },
  });  const pwrWarehouse = await prisma.warehouse.create({
    data: {
      name: "Peshawar Distributor Warehouse",
      shortName: "PWR-DIST",
      cityId: peshawar.id,
      warehouseType: "DISTRIBUTOR",
      distributorId: frontier.id,
    },
  });
  const hydWarehouse = await prisma.warehouse.create({
    data: {
      name: "Hyderabad Distributor Warehouse",
      shortName: "HYD-DIST",
      cityId: hyderabad.id,
      warehouseType: "DISTRIBUTOR",
      distributorId: indus.id,
    },
  });

  // --- Territories and routes -------------------------------------------
  async function territory(name: string, cityId: string) {
    return prisma.territory.create({ data: { name, cityId } });
  }
  const khiCentral = await territory("Karachi Central", karachi.id);
  const khiSouth = await territory("Karachi South", karachi.id);
  const lhrCentral = await territory("Lahore Central", lahore.id);
  const islCentral = await territory("Islamabad Central", islamabad.id);
  const pwrCentral = await territory("Peshawar Central", peshawar.id);
  const hydCentral = await territory("Hyderabad Central", hyderabad.id);

  const routeKhi1 = await prisma.route.create({
    data: { name: "KHI-01 Tariq Road", cityId: karachi.id, territoryId: khiCentral.id },
  });
  const routeKhi2 = await prisma.route.create({
    data: { name: "KHI-02 Gulshan", cityId: karachi.id, territoryId: khiSouth.id },
  });
  const routeLhr1 = await prisma.route.create({
    data: { name: "LHR-01 Gulberg", cityId: lahore.id, territoryId: lhrCentral.id },
  });
  const routeIsl1 = await prisma.route.create({
    data: { name: "ISL-01 Faisalabad Road", cityId: islamabad.id, territoryId: islCentral.id },
  });
  const routePwr1 = await prisma.route.create({
    data: {
      name: "PWR-01 Saddar",
      cityId: peshawar.id,
      territoryId: pwrCentral.id,
      distributorId: frontier.id,
    },
  });
  const routeHyd1 = await prisma.route.create({
    data: {
      name: "HYD-01 Latifabad",
      cityId: hyderabad.id,
      territoryId: hydCentral.id,
      distributorId: indus.id,
    },
  });

  // --- Staff -------------------------------------------------------------
  async function staffMember(input: {
    code: string;
    name: string;
    role: "BOOKER" | "RECOVERY" | "WAREHOUSE" | "FINANCE" | "ADMINISTRATION";
    designation: string;
    salary: number;
    cityId: string;
    routeId?: string;
    distributorId?: string;
    joinedDaysAgo: number;
  }) {
    return prisma.staff.create({
      data: {
        employeeCode: input.code,
        name: input.name,
        staffRole: input.role,
        designation: input.designation,
        baseSalary: input.salary,
        joiningDate: daysAgo(input.joinedDaysAgo),
        cityId: input.cityId,
        routeId: input.routeId,
        distributorId: input.distributorId,
        phone: `0300-${randomInt(1000000, 9999999)}`,
      },
    });
  }

  const bookerAyesha = await staffMember({
    code: "EMP-0001", name: "Ayesha Karim", role: "BOOKER",
    designation: "Order Booker", salary: 58_000, cityId: karachi.id,
    routeId: routeKhi1.id, joinedDaysAgo: 640,
  });
  const bookerBilal = await staffMember({
    code: "EMP-0002", name: "Bilal Nawaz", role: "BOOKER",
    designation: "Order Booker", salary: 55_000, cityId: karachi.id,
    routeId: routeKhi2.id, joinedDaysAgo: 480,
  });
  const bookerDanish = await staffMember({
    code: "EMP-0003", name: "Danish Iqbal", role: "BOOKER",
    designation: "Senior Order Booker", salary: 62_000, cityId: lahore.id,
    routeId: routeLhr1.id, joinedDaysAgo: 900,
  });
  const bookerFaizan = await staffMember({
    code: "EMP-0004", name: "Faizan Ali", role: "BOOKER",
    designation: "Distributor Order Booker", salary: 52_000, cityId: peshawar.id,
    routeId: routePwr1.id, distributorId: frontier.id, joinedDaysAgo: 320,
  });
  const bookerHina = await staffMember({
    code: "EMP-0005", name: "Hina Sardar", role: "BOOKER",
    designation: "Distributor Order Booker", salary: 52_000, cityId: hyderabad.id,
    routeId: routeHyd1.id, distributorId: indus.id, joinedDaysAgo: 260,
  });
  const recoveryJunaid = await staffMember({
    code: "EMP-0006", name: "Junaid Masood", role: "RECOVERY",
    designation: "Recovery Officer", salary: 54_000, cityId: karachi.id,
    routeId: routeKhi1.id, joinedDaysAgo: 700,
  });
  const warehouseKamran = await staffMember({
    code: "EMP-0007", name: "Kamran Sheikh", role: "WAREHOUSE",
    designation: "Warehouse Officer", salary: 61_000, cityId: karachi.id,
    joinedDaysAgo: 1_100,
  });
  const financeNadia = await staffMember({
    code: "EMP-0008", name: "Nadia Rahim", role: "FINANCE",
    designation: "Finance Manager", salary: 95_000, cityId: karachi.id,
    joinedDaysAgo: 1_400,
  });
  const adminOmar = await staffMember({
    code: "EMP-0009", name: "Omar Latif", role: "ADMINISTRATION",
    designation: "Operations Administrator", salary: 88_000, cityId: karachi.id,
    joinedDaysAgo: 1_500,
  });

  // --- Demo logins -------------------------------------------------------
  const adminUser = await prisma.user.create({
    data: {
      name: adminOmar.name,
      email: "admin@demo.local",
      role: "ADMIN",
      staffId: adminOmar.id,
      passwordHash,
    },
  });
  const financeUser = await prisma.user.create({
    data: {
      name: financeNadia.name,
      email: "finance@demo.local",
      role: "FINANCE",
      staffId: financeNadia.id,
      passwordHash,
    },
  });
  await prisma.user.create({
    data: {
      name: warehouseKamran.name,
      email: "warehouse@demo.local",
      role: "WAREHOUSE_STAFF",
      staffId: warehouseKamran.id,
      warehouseId: khiWarehouse.id,
      passwordHash,
    },
  });

  const adminActor: Actor = {
    id: adminUser.id,
    name: adminUser.name,
    email: adminUser.email,
    role: adminUser.role,
    staffId: adminUser.staffId,
    warehouseId: adminUser.warehouseId,
  };
  const financeActor: Actor = {
    id: financeUser.id,
    name: financeUser.name,
    email: financeUser.email,
    role: financeUser.role,
    staffId: financeUser.staffId,
    warehouseId: financeUser.warehouseId,
  };

  // --- Products ----------------------------------------------------------
  const finishedGoods: Awaited<ReturnType<typeof prisma.product.create>>[] = [];
  for (const item of FINISHED_GOODS) {
    finishedGoods.push(
      await prisma.product.create({
        data: {
          sku: item.sku,
          name: item.name,
          productType: "FINISHED_GOOD",
          supplyType: "MANUFACTURED",
          baseUnit: "CARTON",
          unit: "carton",
          standardCost: item.cost,
          defaultPrice: item.price,
        },
      }),
    );
  }
  const rawMaterials: typeof finishedGoods = [];
  for (const item of RAW_MATERIALS) {
    rawMaterials.push(
      await prisma.product.create({
        data: {
          sku: item.sku,
          name: item.name,
          productType: "RAW_MATERIAL",
          supplyType: "PURCHASED",
          baseUnit: "KILOGRAM",
          unit: "kg",
          standardCost: item.cost,
        },
      }),
    );
  }
  const packaging: typeof finishedGoods = [];
  for (const item of PACKAGING) {
    packaging.push(
      await prisma.product.create({
        data: {
          sku: item.sku,
          name: item.name,
          productType: "PACKAGING",
          supplyType: "PURCHASED",
          baseUnit: "PIECE",
          unit: "piece",
          standardCost: item.cost,
        },
      }),
    );
  }

  // --- Customers ---------------------------------------------------------
  type CustomerSeed = {
    name: string;
    type: "DISTRIBUTOR" | "RETAILER";
    cityId: string;
    territoryId?: string;
    routeId: string;
    distributorId?: string;
    bookerId?: string;
    creditLimit: number;
    creditDays: number;
    taxRegistered: boolean;
    address: string;
  };
  const customerSeeds: CustomerSeed[] = [
    {
      name: "Frontier Foods Distribution", type: "DISTRIBUTOR", cityId: peshawar.id,
      routeId: routePwr1.id, distributorId: frontier.id, creditLimit: 2_000_000,
      creditDays: 21, taxRegistered: true, address: "GT Road, Peshawar",
    },
    {
      name: "Indus Trade Partners", type: "DISTRIBUTOR", cityId: hyderabad.id,
      routeId: routeHyd1.id, distributorId: indus.id, creditLimit: 1_800_000,
      creditDays: 21, taxRegistered: true, address: "Auto Bhan Road, Hyderabad",
    },
    {
      name: "Tariq Road Superstore", type: "RETAILER", cityId: karachi.id,
      territoryId: khiCentral.id, routeId: routeKhi1.id, bookerId: bookerAyesha.id,
      creditLimit: 300_000, creditDays: 14, taxRegistered: true,
      address: "Tariq Road, Karachi",
    },
    {
      name: "Bahadurabad Cash & Carry", type: "RETAILER", cityId: karachi.id,
      territoryId: khiCentral.id, routeId: routeKhi1.id, bookerId: bookerAyesha.id,
      creditLimit: 450_000, creditDays: 14, taxRegistered: true,
      address: "Bahadurabad Chowrangi, Karachi",
    },
    {
      name: "Gulshan Family Mart", type: "RETAILER", cityId: karachi.id,
      territoryId: khiSouth.id, routeId: routeKhi2.id, bookerId: bookerBilal.id,
      creditLimit: 220_000, creditDays: 7, taxRegistered: false,
      address: "Block 6, Gulshan-e-Iqbal, Karachi",
    },
    {
      name: "Johar Grocers", type: "RETAILER", cityId: karachi.id,
      territoryId: khiSouth.id, routeId: routeKhi2.id, bookerId: bookerBilal.id,
      creditLimit: 180_000, creditDays: 7, taxRegistered: false,
      address: "Johar Chowrangi, Karachi",
    },
    {
      name: "Gulberg Mega Mart", type: "RETAILER", cityId: lahore.id,
      territoryId: lhrCentral.id, routeId: routeLhr1.id, bookerId: bookerDanish.id,
      creditLimit: 500_000, creditDays: 21, taxRegistered: true,
      address: "Main Boulevard Gulberg, Lahore",
    },
    {
      name: "Model Town Provisions", type: "RETAILER", cityId: lahore.id,
      territoryId: lhrCentral.id, routeId: routeLhr1.id, bookerId: bookerDanish.id,
      creditLimit: 260_000, creditDays: 14, taxRegistered: false,
      address: "Model Town Link Road, Lahore",
    },
    {
      name: "Saddar Grocery Mart", type: "RETAILER", cityId: peshawar.id,
      territoryId: pwrCentral.id, routeId: routePwr1.id, distributorId: frontier.id,
      bookerId: bookerFaizan.id, creditLimit: 160_000, creditDays: 7,
      taxRegistered: false, address: "Saddar Bazaar, Peshawar",
    },
    {
      name: "University Road Stores", type: "RETAILER", cityId: peshawar.id,
      territoryId: pwrCentral.id, routeId: routePwr1.id, distributorId: frontier.id,
      bookerId: bookerFaizan.id, creditLimit: 140_000, creditDays: 7,
      taxRegistered: false, address: "University Road, Peshawar",
    },
    {
      name: "Latifabad Super Store", type: "RETAILER", cityId: hyderabad.id,
      territoryId: hydCentral.id, routeId: routeHyd1.id, distributorId: indus.id,
      bookerId: bookerHina.id, creditLimit: 175_000, creditDays: 7,
      taxRegistered: true, address: "Unit 6, Latifabad, Hyderabad",
    },
    {
      name: "Qasimabad Mart", type: "RETAILER", cityId: hyderabad.id,
      territoryId: hydCentral.id, routeId: routeHyd1.id, distributorId: indus.id,
      bookerId: bookerHina.id, creditLimit: 130_000, creditDays: 7,
      taxRegistered: false, address: "Qasimabad Main Road, Hyderabad",
    },
  ];

  const customers: Awaited<ReturnType<typeof prisma.customer.create>>[] = [];
  for (const seed of customerSeeds) {
    customers.push(
      await prisma.customer.create({
        data: {
          name: seed.name,
          customerType: seed.type,
          cityId: seed.cityId,
          territoryId: seed.territoryId,
          routeId: seed.routeId,
          distributorId: seed.distributorId,
          assignedBookerId: seed.bookerId,
          creditLimit: seed.creditLimit,
          creditDays: seed.creditDays,
          taxRegistered: seed.taxRegistered,
          gstNumber: seed.taxRegistered
            ? `17-00-${randomInt(1000000, 9999999)}-${randomInt(10, 99)}`
            : null,
          address: seed.address,
          phone: `021-${randomInt(30000000, 39999999)}`,
          openingBalance: chance(0.3) ? randomInt(10, 60) * 1_000 : 0,
        },
      }),
    );
  }
  const customerByName = new Map(customers.map((row) => [row.name, row]));

  // --- Opening stock -----------------------------------------------------
  // Posted through receiveStock so StockBalance, StockBatch and StockMovement
  // are written together, exactly as a real receipt would be.
  const openingDate = daysAgo(HISTORY_DAYS + 5);
  let openingInventoryValue = 0;

  async function openBatch(
    warehouseId: string,
    productId: string,
    unitCost: number,
    quantity: number,
    batchNumber: string,
    expiryInDays: number,
    countsAsCompanyAsset: boolean,
  ) {
    await prisma.$transaction(
      async (tx) => {
        await receiveStock(tx, {
          productId,
          warehouseId,
          quantity,
          movementType: "OPENING",
          unitCost,
          referenceType: "OPENING_BALANCE",
          referenceId: batchNumber,
          movementDate: openingDate,
          notes: "Opening stock",
          batch: {
            batchNumber,
            manufacturingDate: daysAgo(HISTORY_DAYS + randomInt(20, 120)),
            expiryDate: daysAhead(expiryInDays),
          },
        });
      },
      { timeout: 20_000 },
    );
    if (countsAsCompanyAsset) openingInventoryValue += quantity * unitCost;
  }

  let batchCounter = 0;
  function nextBatchNumber(prefix: string) {
    batchCounter += 1;
    return `${prefix}-${String(batchCounter).padStart(4, "0")}`;
  }

  for (const product of finishedGoods) {
    // Karachi holds the deepest cover, Lahore a regional buffer, and each
    // distributor warehouse opens with a little stock of its own so secondary
    // sales have something to sell before the first primary shipment lands.
    for (const [warehouse, low, high, isCompany] of [
      [khiWarehouse, 900, 1_500, true],
      [lhrWarehouse, 420, 700, true],
      [pwrWarehouse, 90, 180, false],
      [hydWarehouse, 80, 160, false],
    ] as const) {
      const total = randomInt(low, high);
      const batches = warehouse.warehouseType === "COMPANY" ? 3 : 2;
      for (let index = 0; index < batches; index += 1) {
        const quantity =
          index === batches - 1
            ? total - Math.floor(total / batches) * (batches - 1)
            : Math.floor(total / batches);
        await openBatch(
          warehouse.id,
          product.id,
          product.standardCost,
          quantity,
          nextBatchNumber(product.sku.replace("FG-", "B")),
          // A staggered shelf life: the oldest batch of each product is the
          // one the Inventory expiry view is meant to surface.
          [150, 330, 500][index] ?? 400,
          isCompany,
        );
      }
    }
  }

  for (const product of [...rawMaterials, ...packaging]) {
    // Raw material and packaging stock lives only in company warehouses —
    // a distributor warehouse holds finished goods only.
    await openBatch(
      khiWarehouse.id,
      product.id,
      product.standardCost,
      product.productType === "PACKAGING" ? randomInt(18_000, 40_000) : randomInt(600, 2_600),
      nextBatchNumber(product.sku.slice(0, 6)),
      randomInt(210, 620),
      true,
    );
  }

  // --- Opening ledger ----------------------------------------------------
  const openingCash = 1_250_000;
  const openingBank = 4_600_000;
  await prisma.$transaction(async (tx) =>
    postJournalEntry(tx, {
      actor: adminActor,
      entryDate: openingDate,
      referenceType: "OPENING_BALANCE",
      referenceId: "opening",
      description: "Opening balances",
      lines: [
        { accountCode: ACCOUNT_CODES.INVENTORY, debit: openingInventoryValue },
        { accountCode: ACCOUNT_CODES.CASH, debit: openingCash },
        { accountCode: ACCOUNT_CODES.BANK, debit: openingBank },
        {
          accountCode: ACCOUNT_CODES.OWNERS_EQUITY,
          credit: openingInventoryValue + openingCash + openingBank,
        },
      ],
    }),
  );

  // --- Sales history -----------------------------------------------------
  type Channel = {
    salesType: "PRIMARY" | "SECONDARY" | "DIRECT";
    sellerType: "COMPANY" | "DISTRIBUTOR";
    customerName: string;
    sourceWarehouseId: string;
    destinationWarehouseId: string | null;
    distributorId: string | null;
    routeId: string;
    bookerId: string;
    movementType: "PRIMARY_OUT" | "SECONDARY_OUT" | "DIRECT_OUT";
  };

  const channels: Channel[] = [
    {
      salesType: "PRIMARY", sellerType: "COMPANY", customerName: "Frontier Foods Distribution",
      sourceWarehouseId: khiWarehouse.id, destinationWarehouseId: pwrWarehouse.id,
      distributorId: frontier.id, routeId: routePwr1.id, bookerId: bookerFaizan.id,
      movementType: "PRIMARY_OUT",
    },
    {
      salesType: "PRIMARY", sellerType: "COMPANY", customerName: "Indus Trade Partners",
      sourceWarehouseId: khiWarehouse.id, destinationWarehouseId: hydWarehouse.id,
      distributorId: indus.id, routeId: routeHyd1.id, bookerId: bookerHina.id,
      movementType: "PRIMARY_OUT",
    },
    ...["Tariq Road Superstore", "Bahadurabad Cash & Carry"].map((name) => ({
      salesType: "DIRECT" as const, sellerType: "COMPANY" as const, customerName: name,
      sourceWarehouseId: khiWarehouse.id, destinationWarehouseId: null,
      distributorId: null, routeId: routeKhi1.id, bookerId: bookerAyesha.id,
      movementType: "DIRECT_OUT" as const,
    })),
    ...["Gulshan Family Mart", "Johar Grocers"].map((name) => ({
      salesType: "DIRECT" as const, sellerType: "COMPANY" as const, customerName: name,
      sourceWarehouseId: khiWarehouse.id, destinationWarehouseId: null,
      distributorId: null, routeId: routeKhi2.id, bookerId: bookerBilal.id,
      movementType: "DIRECT_OUT" as const,
    })),
    ...["Gulberg Mega Mart", "Model Town Provisions"].map((name) => ({
      salesType: "DIRECT" as const, sellerType: "COMPANY" as const, customerName: name,
      sourceWarehouseId: lhrWarehouse.id, destinationWarehouseId: null,
      distributorId: null, routeId: routeLhr1.id, bookerId: bookerDanish.id,
      movementType: "DIRECT_OUT" as const,
    })),
    ...["Saddar Grocery Mart", "University Road Stores"].map((name) => ({
      salesType: "SECONDARY" as const, sellerType: "DISTRIBUTOR" as const, customerName: name,
      sourceWarehouseId: pwrWarehouse.id, destinationWarehouseId: null,
      distributorId: frontier.id, routeId: routePwr1.id, bookerId: bookerFaizan.id,
      movementType: "SECONDARY_OUT" as const,
    })),
    ...["Latifabad Super Store", "Qasimabad Mart"].map((name) => ({
      salesType: "SECONDARY" as const, sellerType: "DISTRIBUTOR" as const, customerName: name,
      sourceWarehouseId: hydWarehouse.id, destinationWarehouseId: null,
      distributorId: indus.id, routeId: routeHyd1.id, bookerId: bookerHina.id,
      movementType: "SECONDARY_OUT" as const,
    })),
  ];

  // Recovery is collected by whoever covers that route: the booker who owns
  // the customer, or the Karachi recovery officer on the two Karachi routes he
  // works. Crediting collections to staff who never visit the territory would
  // make the Reports leaderboard meaningless.
  const karachiRoutes = new Set([routeKhi1.id, routeKhi2.id]);
  function collectorFor(routeId: string, bookerId: string) {
    if (karachiRoutes.has(routeId) && chance(0.45)) return recoveryJunaid.id;
    return bookerId;
  }

  /** Available stock, so the generator can never post a negative balance. */
  async function availableQuantity(
    tx: Prisma.TransactionClient,
    warehouseId: string,
    productId: string,
  ) {
    const balance = await tx.stockBalance.findUnique({
      where: { productId_warehouseId: { productId, warehouseId } },
      select: { quantityOnHand: true },
    });
    return balance ? Number(balance.quantityOnHand) : 0;
  }

  let invoiceCount = 0;
  let paymentCount = 0;

  for (let offset = HISTORY_DAYS; offset >= 0; offset -= 1) {
    const invoiceDate = daysAgo(offset);
    const weekday = invoiceDate.getUTCDay();
    if (weekday === 0) continue; // Sunday: no dispatch
    // Two or three invoices on most days, a quiet day here and there.
    const perDay = chance(0.18) ? 0 : randomInt(1, 3);

    for (let index = 0; index < perDay; index += 1) {
      const channel = pick(channels);
      const customer = customerByName.get(channel.customerName)!;
      const isPrimary = channel.salesType === "PRIMARY";
      const lineCount = isPrimary ? randomInt(3, 5) : randomInt(1, 3);
      const chosen = new Set<string>();
      const lines: Array<{
        productId: string;
        quantity: number;
        unitPrice: number;
        discount: number;
        unitCost: number;
      }> = [];

      await prisma.$transaction(
        async (tx) => {
          for (let line = 0; line < lineCount; line += 1) {
            const product = pick(finishedGoods);
            if (chosen.has(product.id)) continue;
            chosen.add(product.id);

            const wanted = isPrimary ? randomInt(40, 110) : randomInt(4, 22);
            const onHand = await availableQuantity(
              tx,
              channel.sourceWarehouseId,
              product.id,
            );
            // Never sell past what the warehouse holds; leave a floor behind
            // so the demo always shows live stock rather than empty shelves.
            const quantity = Math.min(wanted, Math.max(0, Math.floor(onHand - 25)));
            if (quantity <= 0) continue;

            lines.push({
              productId: product.id,
              quantity,
              unitPrice: product.defaultPrice,
              discount: chance(0.35) ? quantity * randomInt(10, 60) : 0,
              unitCost: product.standardCost,
            });
          }
          if (!lines.length) return;

          const invoiceDiscount = chance(0.25) ? randomInt(1, 12) * 500 : 0;
          const taxType = customer.taxRegistered ? "GST" : "NON_GST";
          const taxRateBps = taxType === "GST" ? 1_800 : 0;
          const amounts = calculateInvoice(lines, invoiceDiscount, {
            taxType,
            taxRateBps,
          });

          const invoiceNumber = await nextDocumentNumber(
            tx,
            "invoice",
            "INV",
            invoiceDate,
          );
          const invoice = await tx.invoice.create({
            data: {
              invoiceNumber,
              invoiceDate,
              dueDate: new Date(
                invoiceDate.getTime() + customer.creditDays * DAY_MS,
              ),
              salesType: channel.salesType,
              sellerType: channel.sellerType,
              taxType,
              taxRateBps,
              distributorId: channel.distributorId,
              customerId: customer.id,
              warehouseId: channel.sourceWarehouseId,
              destinationWarehouseId: channel.destinationWarehouseId,
              bookerId: channel.bookerId,
              routeId: channel.routeId,
              createdById: financeUser.id,
              ...amounts,
              balanceAmount: amounts.netAmount,
              status: "POSTED",
              // Anything more than a few days old has completed its delivery
              // cycle; the newest invoices are still in flight.
              deliveryStatus:
                offset > 4 ? "DELIVERED" : offset > 1 ? "STOCK_ISSUED" : "PENDING",
              items: {
                create: lines.map((line) => ({
                  productId: line.productId,
                  quantity: line.quantity,
                  unitPrice: line.unitPrice,
                  unitCostSnapshot: line.unitCost,
                  discount: line.discount,
                  lineTotal: line.quantity * line.unitPrice - line.discount,
                })),
              },
            },
          });

          for (const line of lines) {
            await consumeStock(tx, {
              productId: line.productId,
              warehouseId: channel.sourceWarehouseId,
              quantity: line.quantity,
              movementType: channel.movementType,
              unitCost: line.unitCost,
              referenceType: "INVOICE",
              referenceId: invoice.id,
              movementDate: invoiceDate,
              notes: `${invoiceNumber} — ${customer.name}`,
            });
            // A primary sale is a shipment between warehouses: the goods leave
            // the company warehouse and land in the distributor's.
            if (channel.destinationWarehouseId) {
              await receiveStock(tx, {
                productId: line.productId,
                warehouseId: channel.destinationWarehouseId,
                quantity: line.quantity,
                movementType: "PRIMARY_IN",
                unitCost: line.unitCost,
                referenceType: "INVOICE",
                referenceId: invoice.id,
                movementDate: invoiceDate,
                notes: `${invoiceNumber} — inbound`,
                batch: {
                  batchNumber: nextBatchNumber("PRI"),
                  manufacturingDate: daysAgo(offset + randomInt(10, 60)),
                  expiryDate: daysAhead(randomInt(200, 480)),
                },
              });
            }
          }

          // A distributor's onward resale is that distributor's revenue, not
          // the company's, so SECONDARY never reaches the company ledger.
          if (channel.salesType !== "SECONDARY") {
            const costOfGoodsSold = lines.reduce(
              (sum, line) => sum + line.quantity * line.unitCost,
              0,
            );
            await postJournalEntry(tx, {
              actor: financeActor,
              entryDate: invoiceDate,
              referenceType: "INVOICE",
              referenceId: invoice.id,
              description: `Invoice ${invoiceNumber}`,
              lines: [
                ...salesInvoiceLines(amounts),
                ...salesCogsLines(costOfGoodsSold),
              ],
            });
          }

          // --- Recovery against this invoice -----------------------------
          // Older invoices are mostly settled; recent ones are still open, so
          // the ageing on the Invoices and Reports screens looks like a real
          // receivables book rather than all-paid or all-unpaid.
          const settleOdds = offset > 60 ? 0.85 : offset > 25 ? 0.6 : 0.25;
          if (!chance(settleOdds)) return;

          const full = chance(0.65);
          const amount = full
            ? amounts.netAmount
            : Math.round(amounts.netAmount * (0.3 + random() * 0.4));
          // Collected somewhere between the day after the invoice and today —
          // never dated into the future.
          const paymentDate = new Date(
            Math.min(
              invoiceDate.getTime() + randomInt(1, 25) * DAY_MS,
              TODAY.getTime(),
            ),
          );
          const method = pick(["CASH", "BANK", "CHEQUE", "ONLINE"] as const);
          const collectorId = collectorFor(channel.routeId, channel.bookerId);
          const receiptNumber = await nextDocumentNumber(
            tx,
            "receipt",
            "RCV",
            paymentDate,
          );

          const payment = await tx.payment.create({
            data: {
              receiptNumber,
              customerId: customer.id,
              distributorId: channel.distributorId,
              invoiceId: invoice.id,
              paymentDate,
              amount,
              paymentMethod: method,
              collectedById: collectorId,
              routeId: channel.routeId,
            },
          });
          await tx.invoice.update({
            where: { id: invoice.id },
            data: {
              paidAmount: amount,
              balanceAmount: amounts.netAmount - amount,
              status: full ? "PAID" : "PARTIAL",
            },
          });
          if (channel.salesType !== "SECONDARY") {
            await postJournalEntry(tx, {
              actor: financeActor,
              entryDate: paymentDate,
              referenceType: "PAYMENT",
              referenceId: payment.id,
              description: `Recovery ${receiptNumber} against ${invoiceNumber}`,
              lines: customerPaymentLines(amount, method),
            });
          }
          paymentCount += 1;
        },
        { timeout: 30_000 },
      );

      if (lines.length) invoiceCount += 1;
    }
  }

  // --- Stock transfers ---------------------------------------------------
  // Company-to-company replenishment: Karachi tops up the Lahore warehouse.
  async function transfer(daysBack: number, products: typeof finishedGoods) {
    const transferDate = daysAgo(daysBack);
    await prisma.$transaction(
      async (tx) => {
        const items: Array<{ productId: string; quantity: number; unitCost: number }> = [];
        for (const product of products) {
          const onHand = await availableQuantity(tx, khiWarehouse.id, product.id);
          const quantity = Math.min(randomInt(30, 80), Math.max(0, Math.floor(onHand - 40)));
          if (quantity > 0) {
            items.push({ productId: product.id, quantity, unitCost: product.standardCost });
          }
        }
        if (!items.length) return;

        const transferNumber = await nextDocumentNumber(tx, "stock-transfer", "TRF", transferDate);
        const record = await tx.stockTransfer.create({
          data: {
            transferNumber,
            fromWarehouseId: khiWarehouse.id,
            toWarehouseId: lhrWarehouse.id,
            transferDate,
            notes: "Regional replenishment",
            createdById: adminUser.id,
            items: { create: items.map((item) => ({ ...item, quantity: item.quantity })) },
          },
        });
        for (const item of items) {
          await consumeStock(tx, {
            productId: item.productId,
            warehouseId: khiWarehouse.id,
            quantity: item.quantity,
            movementType: "TRANSFER_OUT",
            unitCost: item.unitCost,
            referenceType: "STOCK_TRANSFER",
            referenceId: record.id,
            movementDate: transferDate,
            notes: transferNumber,
          });
          await receiveStock(tx, {
            productId: item.productId,
            warehouseId: lhrWarehouse.id,
            quantity: item.quantity,
            movementType: "TRANSFER_IN",
            unitCost: item.unitCost,
            referenceType: "STOCK_TRANSFER",
            referenceId: record.id,
            movementDate: transferDate,
            notes: transferNumber,
            batch: {
              batchNumber: nextBatchNumber("TRF"),
              manufacturingDate: daysAgo(daysBack + randomInt(30, 90)),
              expiryDate: daysAhead(randomInt(240, 520)),
            },
          });
        }
      },
      { timeout: 30_000 },
    );
  }
  await transfer(58, finishedGoods.slice(0, 5));
  await transfer(31, finishedGoods.slice(5, 10));
  await transfer(9, finishedGoods.slice(10, 14));

  // --- Inventory adjustments --------------------------------------------
  // Both directions, so the demo can show a write-off hitting the P&L and a
  // stock-count correction that does not.
  async function adjustment(input: {
    daysBack: number;
    warehouseId: string;
    reason: string;
    direction: "IN" | "OUT";
    products: Array<{ id: string; sku: string; standardCost: number }>;
    shortDated: boolean;
  }) {
    const adjustmentDate = daysAgo(input.daysBack);
    await prisma.$transaction(
      async (tx) => {
        const adjustmentNumber = await nextDocumentNumber(
          tx,
          "inventory-adjustment",
          "ADJ",
          adjustmentDate,
        );
        const rows: Array<{ productId: string; quantity: number; unitCost: number }> = [];
        for (const product of input.products) {
          const quantity = randomInt(6, 22);
          if (input.direction === "OUT") {
            const onHand = await availableQuantity(tx, input.warehouseId, product.id);
            if (onHand < quantity + 10) continue;
          }
          rows.push({ productId: product.id, quantity, unitCost: product.standardCost });
        }
        if (!rows.length) return;

        const record = await tx.inventoryAdjustment.create({
          data: {
            adjustmentNumber,
            warehouseId: input.warehouseId,
            adjustmentDate,
            reason: input.reason,
            createdById: adminUser.id,
            items: {
              create: rows.map((row) => ({
                productId: row.productId,
                direction: input.direction,
                quantity: row.quantity,
                unitCost: row.unitCost,
              })),
            },
          },
        });

        for (const row of rows) {
          if (input.direction === "OUT") {
            await consumeStock(tx, {
              productId: row.productId,
              warehouseId: input.warehouseId,
              quantity: row.quantity,
              movementType: "ADJUSTMENT_OUT",
              unitCost: row.unitCost,
              referenceType: "INVENTORY_ADJUSTMENT",
              referenceId: record.id,
              movementDate: adjustmentDate,
              notes: input.reason,
            });
          } else {
            await receiveStock(tx, {
              productId: row.productId,
              warehouseId: input.warehouseId,
              quantity: row.quantity,
              movementType: "ADJUSTMENT_IN",
              unitCost: row.unitCost,
              referenceType: "INVENTORY_ADJUSTMENT",
              referenceId: record.id,
              movementDate: adjustmentDate,
              notes: input.reason,
              batch: {
                batchNumber: nextBatchNumber(input.shortDated ? "SHORT" : "ADJ"),
                manufacturingDate: daysAgo(input.daysBack + randomInt(200, 320)),
                // Short-dated stock coming back off the trade is the case the
                // expiry view exists for, so some of it lands inside the
                // 90-day window the dashboard watches.
                expiryDate: daysAhead(
                  input.shortDated ? randomInt(18, 80) : randomInt(260, 500),
                ),
              },
            });
          }
        }

        // A distributor warehouse is not a company asset, so only company
        // warehouse adjustments reach the general ledger.
        const warehouse = await tx.warehouse.findUniqueOrThrow({
          where: { id: input.warehouseId },
        });
        if (warehouse.warehouseType === "COMPANY") {
          const amount = rows.reduce(
            (sum, row) => sum + row.quantity * row.unitCost,
            0,
          );
          await postJournalEntry(tx, {
            actor: adminActor,
            entryDate: adjustmentDate,
            referenceType: "INVENTORY_ADJUSTMENT",
            referenceId: record.id,
            description: `Adjustment ${adjustmentNumber}: ${input.reason}`,
            lines: inventoryAdjustmentLines(input.direction, amount),
          });
        }
      },
      { timeout: 30_000 },
    );
  }

  await adjustment({
    daysBack: 74, warehouseId: khiWarehouse.id, direction: "OUT",
    reason: "Damaged in handling — written off after physical count",
    products: finishedGoods.slice(0, 3), shortDated: false,
  });
  await adjustment({
    daysBack: 40, warehouseId: lhrWarehouse.id, direction: "OUT",
    reason: "Expired stock destroyed under supervision",
    products: finishedGoods.slice(6, 8), shortDated: false,
  });
  await adjustment({
    daysBack: 21, warehouseId: khiWarehouse.id, direction: "IN",
    reason: "Short-dated stock returned from trade and taken back on count",
    products: finishedGoods.slice(2, 6), shortDated: true,
  });
  await adjustment({
    daysBack: 12, warehouseId: lhrWarehouse.id, direction: "IN",
    reason: "Short-dated stock returned from trade and taken back on count",
    products: finishedGoods.slice(8, 11), shortDated: true,
  });
  await adjustment({
    daysBack: 6, warehouseId: khiWarehouse.id, direction: "IN",
    reason: "Physical count correction — recount of pallet 14",
    products: rawMaterials.slice(0, 2), shortDated: false,
  });

  const [batchCount, movementCount, nearExpiry] = await Promise.all([
    prisma.stockBatch.count(),
    prisma.stockMovement.count(),
    prisma.stockBatch.count({
      where: {
        status: "ACTIVE",
        quantity: { gt: 0 },
        expiryDate: { gte: TODAY, lte: daysAhead(90) },
      },
    }),
  ]);

  console.log(`Demo data ready:
  ${customers.length} customers, ${finishedGoods.length + rawMaterials.length + packaging.length} products, 4 warehouses
  ${invoiceCount} invoices, ${paymentCount} recoveries
  ${batchCount} stock batches (${nearExpiry} expiring within 90 days), ${movementCount} stock movements

  Sign in with:
    admin@demo.local      (Administrator — every module)
    finance@demo.local    (Finance — no master data or user management)
    warehouse@demo.local  (Warehouse — inventory only, no costs or margins)
  Password for all three: ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
