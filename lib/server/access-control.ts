import type { UserRole } from "@prisma/client";
import { DomainError } from "./platform/domain-error";

export const permissions = [
  "VIEW_DASHBOARD",
  "MANAGE_USERS",
  "MANAGE_MASTER_DATA",
  "VIEW_INVOICES",
  "CANCEL_INVOICE",
  "VIEW_INVENTORY",
  "VIEW_RAW_MATERIALS",
  "VIEW_INVENTORY_COST",
  "MANAGE_INVENTORY_ITEMS",
  "ADJUST_INVENTORY",
  "TRANSFER_INVENTORY",
  "VIEW_STAFF_SALARY",
  "VIEW_PNL",
  "VIEW_LEDGER",
] as const;

export type Permission = (typeof permissions)[number];

// Finance owns the money and the stock ledger but not the master data or the
// user list — those stay with the administrator.
const financePermissions: Permission[] = permissions.filter(
  (permission) =>
    permission !== "MANAGE_USERS" && permission !== "MANAGE_MASTER_DATA",
);

export const rolePermissions: Record<UserRole, readonly Permission[]> = {
  ADMIN: permissions,
  FINANCE: financePermissions,
  // Deliberately without VIEW_INVENTORY_COST: a warehouse role counts and
  // moves stock but never sees what it cost the company.
  WAREHOUSE_STAFF: [
    "VIEW_DASHBOARD",
    "VIEW_INVENTORY",
    "VIEW_RAW_MATERIALS",
    "ADJUST_INVENTORY",
    "TRANSFER_INVENTORY",
  ],
};

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  staffId: string | null;
  warehouseId: string | null;
};

export function can(role: UserRole, permission: Permission) {
  return rolePermissions[role].includes(permission);
}

export function assertPermission(actor: Actor, permission: Permission) {
  if (!can(actor.role, permission)) {
    throw new DomainError(403,
      `${actor.role.replaceAll("_", " ")} does not have permission to ${permission.toLowerCase().replaceAll("_", " ")}.`,
        "FORBIDDEN",
    );
  }
}

export function visibleProductTypes(role: UserRole) {
  return can(role, "VIEW_RAW_MATERIALS")
    ? (["RAW_MATERIAL", "PACKAGING", "FINISHED_GOOD"] as const)
    : (["FINISHED_GOOD"] as const);
}
