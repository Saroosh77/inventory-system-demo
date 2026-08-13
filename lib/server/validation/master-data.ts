import { z } from "zod";
import type { MasterResource } from "../../erp/api-types";
import { activeFlag, optionalId } from "./common";

const schemas = {
  cities: z.object({
    name: z.string().trim().min(2).max(100),
    province: z.string().trim().min(2).max(100),
    active: activeFlag,
  }),
  distributors: z.object({
    name: z.string().trim().min(2).max(150),
    cityId: z.string().min(1),
    phone: z.string().trim().max(30).nullable().optional(),
    active: activeFlag,
  }),
  warehouses: z.object({
    name: z.string().trim().min(2).max(150),
    shortName: z.string().trim().min(2).max(60),
    cityId: z.string().min(1),
    warehouseType: z.enum(["COMPANY", "DISTRIBUTOR"]),
    distributorId: optionalId,
    active: activeFlag,
  }),
  customers: z.object({
    name: z.string().trim().min(2).max(150),
    customerType: z.enum(["DISTRIBUTOR", "RETAILER"]),
    cityId: z.string().min(1),
    distributorId: optionalId,
    territoryId: optionalId,
    routeId: optionalId,
    assignedBookerId: optionalId,
    creditLimit: z.coerce.number().int().min(0).default(0),
    openingBalance: z.coerce.number().int().min(0).default(0),
    creditDays: z.coerce.number().int().min(0).default(0),
    taxRegistered: z.boolean().optional(),
    gstNumber: z.string().trim().max(50).nullable().optional(),
    active: activeFlag,
  }),
  staff: z.object({
    employeeCode: z.string().trim().max(40).nullable().optional(),
    name: z.string().trim().min(2).max(150),
    staffRole: z.enum(["SALESPERSON", "BOOKER", "RECOVERY", "DELIVERY", "WAREHOUSE", "FINANCE", "ADMINISTRATION"]),
    designation: z.string().trim().max(100).nullable().optional(),
    phone: z.string().trim().max(30).nullable().optional(),
    baseSalary: z.coerce.number().int().min(0).default(0),
    cityId: z.string().min(1),
    distributorId: optionalId,
    routeId: optionalId,
    active: activeFlag,
  }),
  routes: z.object({
    name: z.string().trim().min(2).max(150),
    cityId: z.string().min(1),
    territoryId: optionalId,
    distributorId: optionalId,
    active: activeFlag,
  }),
  users: z.object({
    email: z.string().trim().email(),
    name: z.string().trim().min(2).max(150),
    role: z.enum(["ADMIN", "FINANCE", "WAREHOUSE_STAFF"]),
    staffId: optionalId,
    warehouseId: optionalId,
    password: z.string().min(12).max(72),
    active: activeFlag,
  }),
} satisfies Record<MasterResource, z.ZodObject<z.ZodRawShape>>;

export function parseMasterPayload(resource: MasterResource, payload: unknown, partial = false) {
  return (partial ? schemas[resource].partial() : schemas[resource]).parse(payload);
}

export function isMasterResource(value: string): value is MasterResource {
  return Object.prototype.hasOwnProperty.call(schemas, value);
}
