import { Prisma } from "@prisma/client";
import { prisma } from "../../../db";
import type { MasterResource } from "../../../erp/api-types";
import { assertPermission, type Actor } from "../../access-control";
import { hashPassword } from "../../auth/password";
import { DomainError } from "../../platform/domain-error";

type PageInput = {
  skip: number;
  page: number;
  pageSize: number;
  search: string;
  includeInactive: boolean;
};

/**
 * Independent check inside the service layer, not just at the route
 * boundary. `app/api/admin/master-data/**` currently gates every handler
 * with `requireAdmin`, but that only protects requests that go through those
 * exact route files — any other caller of these exports would otherwise run
 * unauthorized. "users" is checked separately from the rest of master data
 * since account management is more sensitive than editing a city or route.
 */
function assertMasterDataPermission(resource: MasterResource, actor: Actor) {
  assertPermission(actor, resource === "users" ? "MANAGE_USERS" : "MANAGE_MASTER_DATA");
}

const relationLookups = async () => {
  const [cities, distributors, routes, staff, warehouses] = await Promise.all([
    prisma.city.findMany({
      where: { active: true },
      select: { id: true, name: true, province: true },
      orderBy: [{ province: "asc" }, { name: "asc" }],
    }),
    prisma.distributor.findMany({
      where: { active: true },
      select: { id: true, name: true, cityId: true },
      orderBy: { name: "asc" },
    }),
    prisma.route.findMany({
      where: { active: true },
      select: { id: true, name: true, cityId: true, distributorId: true },
      orderBy: { name: "asc" },
    }),
    prisma.staff.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        employeeCode: true,
        staffRole: true,
        designation: true,
        baseSalary: true,
        cityId: true,
        distributorId: true,
        routeId: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.warehouse.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        shortName: true,
        cityId: true,
        warehouseType: true,
        distributorId: true,
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return { cities, distributors, routes, staff, warehouses };
};

export async function listMasterData(resource: MasterResource, input: PageInput, actor: Actor) {
  assertMasterDataPermission(resource, actor);
  const activeWhere = input.includeInactive ? {} : { active: true };
  const nameWhere = input.search ? { name: { contains: input.search, mode: Prisma.QueryMode.insensitive } } : {};
  const where = { ...activeWhere, ...nameWhere };

  const result = await (async () => {
    switch (resource) {
      case "cities": return Promise.all([
        prisma.city.findMany({ where, skip: input.skip, take: input.pageSize, orderBy: [{ province: "asc" }, { name: "asc" }] }),
        prisma.city.count({ where }),
      ]);
      case "distributors": return Promise.all([
        prisma.distributor.findMany({ where, skip: input.skip, take: input.pageSize, orderBy: { name: "asc" } }),
        prisma.distributor.count({ where }),
      ]);
      case "warehouses": return Promise.all([
        prisma.warehouse.findMany({ where, skip: input.skip, take: input.pageSize, orderBy: { name: "asc" } }),
        prisma.warehouse.count({ where }),
      ]);
      case "customers": return Promise.all([
        prisma.customer.findMany({ where, skip: input.skip, take: input.pageSize, orderBy: { name: "asc" } }),
        prisma.customer.count({ where }),
      ]);
      case "staff": return Promise.all([
        prisma.staff.findMany({ where, skip: input.skip, take: input.pageSize, orderBy: { name: "asc" } }),
        prisma.staff.count({ where }),
      ]);
      case "routes": return Promise.all([
        prisma.route.findMany({ where, skip: input.skip, take: input.pageSize, orderBy: { name: "asc" } }),
        prisma.route.count({ where }),
      ]);
      case "users": {
        const userWhere = input.search
          ? { ...activeWhere, OR: [{ name: { contains: input.search, mode: Prisma.QueryMode.insensitive } }, { email: { contains: input.search, mode: Prisma.QueryMode.insensitive } }] }
          : activeWhere;
        return Promise.all([
          // passwordHash is selected only to derive hasPassword below, then
          // stripped before the row leaves this function — the hash itself
          // must never reach a response. Without this flag an active account
          // with no password is indistinguishable from a normal one in the
          // admin list, so it can only be found by querying the database.
          prisma.user.findMany({ where: userWhere, skip: input.skip, take: input.pageSize, orderBy: { name: "asc" } }),
          prisma.user.count({ where: userWhere }),
        ]);
      }
    }
  })();

  const [rows, total] = result;
  const visibleRows =
    resource === "users"
      ? (rows as Array<Record<string, unknown>>).map(({ passwordHash, ...row }) => ({
          ...row,
          hasPassword: Boolean(passwordHash),
        }))
      : rows;
  return { resource, rows: visibleRows, total, page: input.page, pageSize: input.pageSize, lookups: await relationLookups() };
}

export async function createMasterRecord(resource: MasterResource, payload: Record<string, unknown>, actor: Actor) {
  assertMasterDataPermission(resource, actor);
  const { data } = await preparePayload(resource, payload);
  return prisma.$transaction(async (tx) => {
    if (resource === "warehouses") validateWarehouseLink(data);
    if (resource === "users") validateUserAssignment(data);
    if (resource === "customers") validateCustomerAssignment(data);
    const result = await createRecord(tx, resource, data);
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "CREATE",
        entityType: resource,
        entityId: result.id,
        after: toJson(result),
      },
    });
    return result;
  });
}

export async function updateMasterRecord(resource: MasterResource, id: string, payload: Record<string, unknown>, actor: Actor) {
  assertMasterDataPermission(resource, actor);
  const { data, passwordChanged } = await preparePayload(resource, payload);
  return prisma.$transaction(async (tx) => {
    if (resource === "warehouses") validateWarehouseLink(data, true);
    await protectAdministratorAccess(tx, resource, id, data, actor);
    const before = await findRecord(tx, resource, id);
    if (!before) throw new DomainError(404, "Master-data record not found.", "NOT_FOUND");
    if (resource === "users") {
      validateUserAssignment({
        ...(before as unknown as Record<string, unknown>),
        ...data,
      });
      await assertNotReactivatingWithoutPassword(tx, id, data);
    }
    if (resource === "customers") {
      validateCustomerAssignment({
        ...(before as unknown as Record<string, unknown>),
        ...data,
      });
    }
    const result = await updateRecord(tx, resource, id, data);
    if (resource === "users" && passwordChanged) {
      await tx.authSession.deleteMany({ where: { userId: id } });
    }
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "UPDATE",
        entityType: resource,
        entityId: id,
        before: toJson(before),
        after: toJson(result),
      },
    });
    return result;
  });
}

export async function deactivateMasterRecord(resource: MasterResource, id: string, actor: Actor) {
  assertMasterDataPermission(resource, actor);
  return prisma.$transaction(async (tx) => {
    await protectAdministratorAccess(tx, resource, id, { active: false }, actor);
    const before = await findRecord(tx, resource, id);
    if (!before) throw new DomainError(404, "Master-data record not found.", "NOT_FOUND");
    const result = await updateRecord(tx, resource, id, { active: false });
    await tx.auditLog.create({
      data: {
        actorId: actor.id,
        actorName: actor.name,
        action: "DEACTIVATE",
        entityType: resource,
        entityId: id,
        before: toJson(before),
        after: toJson(result),
      },
    });
    return result;
  });
}

async function preparePayload(
  resource: MasterResource,
  payload: Record<string, unknown>,
) {
  const data = { ...payload };
  if (resource !== "users") return { data, passwordChanged: false };

  if (typeof data.email === "string") {
    data.email = data.email.trim().toLowerCase();
  }

  const password = typeof data.password === "string" ? data.password : "";
  delete data.password;
  if (!password) return { data, passwordChanged: false };

  data.passwordHash = await hashPassword(password);
  return { data, passwordChanged: true };
}

function validateUserAssignment(payload: Record<string, unknown>) {
  if (payload.role === "WAREHOUSE_STAFF" && !payload.warehouseId) {
    throw new DomainError(422, "Warehouse staff must be assigned to a warehouse.", "WAREHOUSE_LINK_REQUIRED");
  }
}

/**
 * Blocks a request that would deliberately bring a user back to active
 * without a password. PATCH does not require a password — omitting it means
 * "keep the existing one" — so without this check an admin could reactivate
 * an old, passwordless account into a login that can never succeed.
 *
 * Only fires when the request explicitly sets active: true; it does not
 * re-validate every unrelated edit to an already-active passwordless account,
 * since that would make such a record impossible to even rename until a
 * password is set.
 */
async function assertNotReactivatingWithoutPassword(
  tx: Prisma.TransactionClient,
  id: string,
  payload: Record<string, unknown>,
) {
  if (payload.active !== true) return;
  if (typeof payload.passwordHash === "string" && payload.passwordHash) return;

  const existing = await tx.user.findUnique({ where: { id }, select: { passwordHash: true } });
  if (!existing?.passwordHash) {
    throw new DomainError(
      422,
      "This user has no password and cannot be activated. Set a password to reactivate them.",
      "USER_MISSING_PASSWORD",
    );
  }
}

async function protectAdministratorAccess(
  tx: Prisma.TransactionClient,
  resource: MasterResource,
  id: string,
  payload: Record<string, unknown>,
  actor: Actor,
) {
  if (resource !== "users") return;

  const removesAdminAccess =
    payload.active === false ||
    (payload.role !== undefined && payload.role !== "ADMIN");
  if (!removesAdminAccess) return;

  if (id === actor.id) {
    throw new DomainError(
      403,
      "You cannot deactivate or demote your own administrator account.",
      "FORBIDDEN",
    );
  }

  const target = await tx.user.findUnique({
    where: { id },
    select: { active: true, role: true },
  });
  if (!target?.active || target.role !== "ADMIN") return;

  const activeAdministrators = await tx.user.count({
    where: { active: true, role: "ADMIN" },
  });
  if (activeAdministrators <= 1) {
    throw new DomainError(403, "At least one active administrator must remain.", "FORBIDDEN");
  }
}

function validateCustomerAssignment(payload: Record<string, unknown>) {
  if (payload.customerType === "RETAILER" && !payload.routeId) {
    throw new DomainError(422, "Retailers must be assigned to a route.", "ROUTE_REQUIRED");
  }
}

function validateWarehouseLink(payload: Record<string, unknown>, partial = false) {
  if (partial && payload.warehouseType === undefined && payload.distributorId === undefined) return;
  if (payload.warehouseType === "DISTRIBUTOR" && !payload.distributorId)
    throw new DomainError(422, "A distributor warehouse must be linked to a distributor.", "DISTRIBUTOR_LINK_REQUIRED");
  if (payload.warehouseType === "COMPANY" && payload.distributorId)
    throw new DomainError(422, "A company warehouse cannot be linked to a distributor.", "INVALID_WAREHOUSE_LINK");
}

function toJson(value: object): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

async function createRecord(tx: Prisma.TransactionClient, resource: MasterResource, payload: Record<string, unknown>) {
  switch (resource) {
    case "cities": return tx.city.create({ data: payload as unknown as Prisma.CityCreateInput });
    case "distributors": return tx.distributor.create({ data: payload as unknown as Prisma.DistributorUncheckedCreateInput });
    case "warehouses": return tx.warehouse.create({ data: payload as unknown as Prisma.WarehouseUncheckedCreateInput });
    case "customers": return tx.customer.create({ data: payload as unknown as Prisma.CustomerUncheckedCreateInput });
    case "staff": return tx.staff.create({ data: payload as unknown as Prisma.StaffUncheckedCreateInput });
    case "routes": return tx.route.create({ data: payload as unknown as Prisma.RouteUncheckedCreateInput });
    case "users": return tx.user.create({ data: payload as unknown as Prisma.UserUncheckedCreateInput, omit: { passwordHash: true } });
  }
}

async function updateRecord(tx: Prisma.TransactionClient, resource: MasterResource, id: string, payload: Record<string, unknown>) {
  switch (resource) {
    case "cities": return tx.city.update({ where: { id }, data: payload as Prisma.CityUpdateInput });
    case "distributors": return tx.distributor.update({ where: { id }, data: payload as Prisma.DistributorUncheckedUpdateInput });
    case "warehouses": return tx.warehouse.update({ where: { id }, data: payload as Prisma.WarehouseUncheckedUpdateInput });
    case "customers": return tx.customer.update({ where: { id }, data: payload as Prisma.CustomerUncheckedUpdateInput });
    case "staff": return tx.staff.update({ where: { id }, data: payload as Prisma.StaffUncheckedUpdateInput });
    case "routes": return tx.route.update({ where: { id }, data: payload as Prisma.RouteUncheckedUpdateInput });
    case "users": return tx.user.update({ where: { id }, data: payload as Prisma.UserUpdateInput, omit: { passwordHash: true } });
  }
}

async function findRecord(tx: Prisma.TransactionClient, resource: MasterResource, id: string) {
  switch (resource) {
    case "cities": return tx.city.findUnique({ where: { id } });
    case "distributors": return tx.distributor.findUnique({ where: { id } });
    case "warehouses": return tx.warehouse.findUnique({ where: { id } });
    case "customers": return tx.customer.findUnique({ where: { id } });
    case "staff": return tx.staff.findUnique({ where: { id } });
    case "routes": return tx.route.findUnique({ where: { id } });
    case "users": return tx.user.findUnique({ where: { id }, omit: { passwordHash: true } });
  }
}
