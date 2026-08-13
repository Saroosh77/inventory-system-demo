import type { NamedEntity, WorkspaceRoute, WorkspaceStaff, WorkspaceWarehouse } from "./types";

export type CityOption = NamedEntity & { province: string };

export const masterResources = [
  "cities",
  "distributors",
  "warehouses",
  "customers",
  "staff",
  "routes",
  "users",
] as const;

export type MasterResource = (typeof masterResources)[number];

export type MasterRecord = {
  id: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  [key: string]: string | number | boolean | null;
};

export type MasterDataResponse = {
  resource: MasterResource;
  rows: MasterRecord[];
  total: number;
  page: number;
  pageSize: number;
  lookups: {
    cities: CityOption[];
    distributors: Array<NamedEntity & { cityId: string }>;
    routes: WorkspaceRoute[];
    staff: WorkspaceStaff[];
    warehouses: WorkspaceWarehouse[];
  };
};
