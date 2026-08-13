"use client";

import { AlertCircle, ChevronDown, Edit3, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { invalidateApiCache, useApiData } from "../../../lib/client/use-api-data";
import type { MasterDataResponse, MasterRecord, MasterResource } from "../../../lib/erp/api-types";
import { masterResources } from "../../../lib/erp/api-types";
import { formatPkr, salesTypeLabel } from "../../../lib/erp/format";
import { EmptyState, SectionError, SectionLoading } from "../ui/section-state";

type FieldConfig = {
  key: string;
  label: string;
  kind?: "text" | "email" | "password" | "number" | "select" | "checkbox";
  required?: boolean;
  requiredOnCreate?: boolean;
  placeholder?: string;
  options?: Array<{ id: string; name: string }>;
  source?: "cities" | "distributors" | "routes" | "staff" | "warehouses";
  nullable?: boolean;
};

type ResourceConfig = {
  label: string;
  singular: string;
  columns: Array<{ key: string; label: string }>;
  fields: FieldConfig[];
};

const staticOptions = {
  warehouseType: ["COMPANY", "DISTRIBUTOR"],
  customerType: ["DISTRIBUTOR", "RETAILER"],
  staffRole: ["SALESPERSON", "BOOKER", "RECOVERY", "DELIVERY", "WAREHOUSE", "FINANCE", "ADMINISTRATION"],
  role: ["ADMIN", "FINANCE", "WAREHOUSE_STAFF"],
};

const configs: Record<MasterResource, ResourceConfig> = {
  cities: { label: "Cities", singular: "city", columns: [{ key: "name", label: "City" }, { key: "province", label: "Province / territory" }], fields: [{ key: "name", label: "City name", required: true, placeholder: "e.g. Faisalabad" }, { key: "province", label: "Province / territory", required: true, placeholder: "e.g. Punjab" }] },
  distributors: { label: "Distributors", singular: "distributor", columns: [{ key: "name", label: "Distributor" }, { key: "cityId", label: "City" }, { key: "phone", label: "Phone" }], fields: [{ key: "name", label: "Distributor name", required: true, placeholder: "e.g. Al-Rehman Distributors" }, { key: "cityId", label: "City", kind: "select", source: "cities", required: true, placeholder: "Select city" }, { key: "phone", label: "Phone", placeholder: "e.g. 0300-1234567" }] },
  warehouses: { label: "Warehouses", singular: "warehouse", columns: [{ key: "name", label: "Warehouse" }, { key: "shortName", label: "Short name" }, { key: "warehouseType", label: "Type" }, { key: "cityId", label: "City" }, { key: "distributorId", label: "Distributor" }], fields: [{ key: "name", label: "Warehouse name", required: true, placeholder: "e.g. Lahore Company Warehouse" }, { key: "shortName", label: "Short name", required: true, placeholder: "e.g. LHE-COMP" }, { key: "warehouseType", label: "Warehouse type", kind: "select", options: staticOptions.warehouseType.map(option), required: true, placeholder: "Select warehouse type" }, { key: "cityId", label: "City", kind: "select", source: "cities", required: true, placeholder: "Select city" }, { key: "distributorId", label: "Distributor", kind: "select", source: "distributors", nullable: true, placeholder: "Select distributor" }] },
  customers: { label: "Customers", singular: "customer", columns: [{ key: "name", label: "Customer" }, { key: "customerType", label: "Type" }, { key: "cityId", label: "City" }, { key: "distributorId", label: "Distributor" }, { key: "creditLimit", label: "Credit limit" }], fields: [{ key: "name", label: "Customer name", required: true, placeholder: "e.g. Ahmed General Store" }, { key: "customerType", label: "Customer type", kind: "select", options: staticOptions.customerType.map(option), required: true, placeholder: "Select customer type" }, { key: "cityId", label: "City", kind: "select", source: "cities", required: true, placeholder: "Select city" }, { key: "distributorId", label: "Distributor", kind: "select", source: "distributors", nullable: true, placeholder: "Select distributor" }, { key: "routeId", label: "Route", kind: "select", source: "routes", nullable: true, placeholder: "Select route" }, { key: "assignedBookerId", label: "Assigned booker", kind: "select", source: "staff", nullable: true, placeholder: "Select booker" }, { key: "phone", label: "Phone", placeholder: "e.g. 0300-1234567" }, { key: "address", label: "Address", placeholder: "Shop address or nearby landmark" }, { key: "creditLimit", label: "Credit limit", kind: "number", placeholder: "0 = unlimited" }, { key: "openingBalance", label: "Opening balance", kind: "number", placeholder: "0" }, { key: "creditDays", label: "Credit days", kind: "number", placeholder: "e.g. 30" }, { key: "taxRegistered", label: "GST registered", kind: "checkbox" }, { key: "gstNumber", label: "GST number", placeholder: "e.g. 03-45-1234567-89" }] },
  staff: { label: "Staff", singular: "staff member", columns: [{ key: "employeeCode", label: "Code" }, { key: "name", label: "Name" }, { key: "staffRole", label: "Role" }, { key: "cityId", label: "City" }, { key: "routeId", label: "Route" }], fields: [{ key: "employeeCode", label: "Employee code", placeholder: "e.g. EMP-0042" }, { key: "name", label: "Name", required: true, placeholder: "e.g. Ali Raza" }, { key: "staffRole", label: "Staff role", kind: "select", options: staticOptions.staffRole.map(option), required: true, placeholder: "Select staff role" }, { key: "designation", label: "Designation", placeholder: "e.g. Senior Sales Officer" }, { key: "baseSalary", label: "Base salary", kind: "number", placeholder: "e.g. 45000" }, { key: "cityId", label: "City", kind: "select", source: "cities", required: true, placeholder: "Select city" }, { key: "distributorId", label: "Distributor", kind: "select", source: "distributors", nullable: true, placeholder: "Select distributor" }, { key: "routeId", label: "Route", kind: "select", source: "routes", nullable: true, placeholder: "Select route" }] },
  routes: { label: "Routes", singular: "route", columns: [{ key: "name", label: "Route" }, { key: "cityId", label: "City" }, { key: "distributorId", label: "Distributor" }], fields: [{ key: "name", label: "Route name", required: true, placeholder: "e.g. Gulberg Route A" }, { key: "cityId", label: "City", kind: "select", source: "cities", required: true, placeholder: "Select city" }, { key: "distributorId", label: "Distributor", kind: "select", source: "distributors", nullable: true, placeholder: "Select distributor" }] },
  users: { label: "Users", singular: "user", columns: [{ key: "name", label: "Name" }, { key: "email", label: "Email" }, { key: "hasPassword", label: "Password" }, { key: "role", label: "Role" }, { key: "staffId", label: "Employee" }, { key: "warehouseId", label: "Warehouse" }], fields: [{ key: "name", label: "Name", required: true, placeholder: "e.g. Ali Raza" }, { key: "email", label: "Email", kind: "email", required: true, placeholder: "name@company.com" }, { key: "password", label: "Password", kind: "password", requiredOnCreate: true, placeholder: "12–72 characters; leave blank to keep current" }, { key: "role", label: "Role", kind: "select", options: staticOptions.role.map(option), required: true, placeholder: "Select role" }, { key: "staffId", label: "Linked employee", kind: "select", source: "staff", nullable: true, placeholder: "Select employee" }, { key: "warehouseId", label: "Assigned warehouse", kind: "select", source: "warehouses", nullable: true, placeholder: "Select warehouse" }] },
};

function option(value: string) { return { id: value, name: salesTypeLabel(value) }; }

const ADMIN_API_BASE = "/api/admin/master-data";

export default function MasterDataPage({ notify }: { notify: (message: string) => void }) {
  const [resource, setResource] = useState<MasterResource>("users");
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<MasterRecord | null | "new">(null);
  const url = useMemo(() => `${ADMIN_API_BASE}/${resource}?page=${page}&pageSize=100&search=${encodeURIComponent(search)}&includeInactive=${includeInactive}`, [includeInactive, page, resource, search]);
  const { data, loading, error, reload } = useApiData<MasterDataResponse>(url);
  const config = configs[resource];

  if (loading && !data) return <SectionLoading label={`Loading ${config.label.toLowerCase()}`} />;
  if (error || !data) return <SectionError message={error ?? "Master data is unavailable."} onRetry={reload} />;

  function chooseResource(next: MasterResource) { setResource(next); setPage(1); setSearch(""); setSearchInput(""); setEditing(null); }
  async function deactivate(record: MasterRecord) {
    const display = String(record.name ?? record.sku ?? record.email ?? record.id);
    if (!window.confirm(`Deactivate ${display}? Historical transactions will be preserved.`)) return;
    const response = await fetch(`${ADMIN_API_BASE}/${resource}/${record.id}`, { method: "DELETE", credentials: "same-origin" });
    const body = await response.json();
    if (!response.ok) return notify(body.error ?? `Unable to deactivate ${config.singular}.`);
    invalidateApiCache(`${ADMIN_API_BASE}/${resource}`); reload(); notify(`${display} deactivated.`);
  }

  return <div className="workspace-stack">
    <section className="panel workspace-panel master-admin"><div className="workspace-heading"><div><span className="panel-kicker">Administrator controls</span><h2>Master data management</h2><p>Edit and deactivate records without breaking transaction history.</p></div><button className="primary-button small" type="button" onClick={() => setEditing("new")}><Plus size={16} /> Add {config.singular}</button></div>
      <div className="master-tabs" role="tablist">{masterResources.map((item) => <button key={item} type="button" className={resource === item ? "active" : ""} onClick={() => chooseResource(item)}>{configs[item].label}</button>)}</div>
      <div className="master-toolbar"><form onSubmit={(event) => { event.preventDefault(); setPage(1); setSearch(searchInput); }}><Search size={17} /><input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={`Search ${config.label.toLowerCase()}`} /><button type="submit" className="secondary-button">Search</button></form><label className="checkbox-field"><input type="checkbox" checked={includeInactive} onChange={(event) => { setPage(1); setIncludeInactive(event.target.checked); }} /> Show inactive</label></div>
      {data.rows.length === 0 ? <EmptyState title={`No ${config.label.toLowerCase()} found`} detail={`Add a ${config.singular} or change the current search.`} /> : <div className="table-wrap"><table><thead><tr>{config.columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Status</th><th className="align-right">Actions</th></tr></thead><tbody>{data.rows.map((row) => <tr key={row.id} className={!row.active ? "inactive-row" : ""}>{config.columns.map((column) => <td key={column.key}>{formatCell(column.key, row[column.key], data)}</td>)}<td><span className={`status-pill ${row.active ? "paid" : "cancelled"}`}>{row.active ? "Active" : "Inactive"}</span></td><td className="align-right"><div className="row-actions"><button type="button" className="table-action" onClick={() => setEditing(row)}><Edit3 size={14} /> Edit</button>{row.active ? <button type="button" className="table-action danger" onClick={() => deactivate(row)}><Trash2 size={14} /> Delete</button> : null}</div></td></tr>)}</tbody></table></div>}
      <div className="pagination-row"><span>Showing {data.rows.length} of {data.total}</span><div><button className="secondary-button" type="button" disabled={page === 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span>Page {page}</span><button className="secondary-button" type="button" disabled={page * data.pageSize >= data.total} onClick={() => setPage((value) => value + 1)}>Next</button></div></div>
    </section>
    {editing ? <MasterForm resource={resource} config={config} record={editing === "new" ? null : editing} data={data} onClose={() => setEditing(null)} onSaved={(message) => { invalidateApiCache(`${ADMIN_API_BASE}/${resource}`); reload(); setEditing(null); notify(message); }} /> : null}
  </div>;
}

function MasterForm({ resource, config, record, data, onClose, onSaved }: { resource: MasterResource; config: ResourceConfig; record: MasterRecord | null; data: MasterDataResponse; onClose: () => void; onSaved: (message: string) => void }) {
  const [values, setValues] = useState<Record<string, string | number | boolean | null>>(() => Object.fromEntries(config.fields.map((field) => [field.key, record?.[field.key] ?? defaultValue(field)])));
  const [active, setActive] = useState(record?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setSubmitting(true); setError(null);
    const payload = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, key.endsWith("Id") && value === "" ? null : value]));
    if (resource === "users" && record && !payload.password) delete payload.password;
    if (record) payload.active = active;
    try {
      const response = await fetch(record ? `${ADMIN_API_BASE}/${resource}/${record.id}` : `${ADMIN_API_BASE}/${resource}`, { method: record ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload), credentials: "same-origin" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? `Unable to save ${config.singular}.`);
      onSaved(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} ${record ? "updated" : "added"}.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : `Unable to save ${config.singular}.`); }
    finally { setSubmitting(false); }
  }

  return <div className="modal-backdrop"><section className="modal-card master-form-modal" role="dialog" aria-modal="true"><header><div><span className="panel-kicker">Master data</span><h2>{record ? "Edit" : "Add"} {config.singular}</h2><p>Changes are validated by the dedicated admin API and written to the audit log.</p></div><button className="modal-close" type="button" onClick={onClose}><X size={20} /></button></header><form className="erp-form" onSubmit={submit}><div className="form-grid two">{config.fields.map((field) => <MasterField key={field.key} field={field} value={values[field.key]} data={data} creating={!record} onChange={(value) => setValues((current) => ({ ...current, [field.key]: value }))} />)}</div>{record ? <label className="checkbox-field"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> Active record</label> : null}{error ? <div className="form-error"><AlertCircle size={17} /> {error}</div> : null}<div className="modal-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit" disabled={submitting}>{submitting ? "Saving…" : `Save ${config.singular}`}</button></div></form></section></div>;
}

function MasterField({ field, value, data, creating, onChange }: { field: FieldConfig; value: string | number | boolean | null; data: MasterDataResponse; creating: boolean; onChange: (value: string | number | boolean) => void }) {
  const options = field.options ?? (field.source ? data.lookups[field.source] : []);
  if (field.kind === "checkbox") return <label className="checkbox-field master-checkbox"><input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /> {field.label}</label>;
  return <label className="form-field"><span>{field.label}</span>{field.kind === "select" ? <div className="select-shell"><select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} required={field.required}><option value="">{field.nullable ? "None" : (field.placeholder ?? `Select ${field.label.toLowerCase()}`)}</option>{options.map((item) => <option key={item.id} value={item.id}>{"province" in item ? `${item.name} · ${item.province}` : item.name}</option>)}</select><ChevronDown size={16} /></div> : <input type={field.kind ?? "text"} min={field.kind === "number" ? 0 : undefined} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(field.kind === "number" ? Number(event.target.value) : event.target.value)} required={field.required || (creating && field.requiredOnCreate)} />}</label>;
}

function defaultValue(field: FieldConfig) {
  if (field.kind === "checkbox") return false;
  return field.kind === "number" ? 0 : field.options?.[0]?.id ?? "";
}
function formatCell(key: string, value: MasterRecord[string], data: MasterDataResponse) {
  if (key === "hasPassword") return <span className={`status-pill ${value ? "paid" : "cancelled"}`}>{value ? "Set" : "Missing"}</span>;
  if (value === null || value === "") return "—";
  if (key === "cityId") return data.lookups.cities.find((item) => item.id === value)?.name ?? String(value);
  if (key === "distributorId") return data.lookups.distributors.find((item) => item.id === value)?.name ?? String(value);
  if (key === "routeId") return data.lookups.routes.find((item) => item.id === value)?.name ?? String(value);
  if (key === "assignedBookerId") return data.lookups.staff.find((item) => item.id === value)?.name ?? String(value);
  if (key === "staffId") return data.lookups.staff.find((item) => item.id === value)?.name ?? String(value);
  if (key === "warehouseId") return data.lookups.warehouses.find((item) => item.id === value)?.shortName ?? String(value);
  if (["creditLimit", "openingBalance", "standardCost", "defaultPrice", "baseSalary"].includes(key)) return formatPkr(Number(value));
  if (["warehouseType", "customerType", "productType", "staffRole", "role"].includes(key)) return salesTypeLabel(String(value));
  return String(value);
}
