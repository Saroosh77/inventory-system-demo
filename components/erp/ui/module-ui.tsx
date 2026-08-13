"use client";

import {
  AlertCircle,
  ChevronDown,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { formatPkr, salesTypeLabel } from "@/lib/erp/format";
import type { SalesType, WorkspaceData } from "@/lib/erp/types";

export function ModuleTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; count?: number }>;
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <nav className="module-tabs" aria-label="Module panels">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? "active" : ""}
          onClick={() => onChange(tab.id)}>
          {tab.label}
          {tab.count !== undefined ? <span>{tab.count}</span> : null}
        </button>
      ))}
    </nav>
  );
}

export function WorkspaceHeading({
  kicker,
  title,
  description,
  action,
  onAction,
}: {
  kicker: string;
  title: string;
  description?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="workspace-heading">
      <div>
        <span className="panel-kicker">{kicker}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? (
        <button
          className="primary-button small"
          type="button"
          onClick={onAction}>
          <Plus size={16} />
          {action}
        </button>
      ) : null}
    </div>
  );
}

export function Summary({
  label,
  value,
  icon: Icon,
  detail,
}: {
  label: string;
  value: string;
  icon: ComponentType<{ size?: number }>;
  detail?: string;
}) {
  return (
    <article className="summary-card panel">
      <span className="summary-icon tone-1">
        <Icon size={20} />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail ? <em>{detail}</em> : null}
      </div>
    </article>
  );
}

export function DataTable({
  headers,
  children,
  empty,
  emptyLabel,
}: {
  headers: string[];
  children: ReactNode;
  empty?: boolean;
  /** Replaces the generic empty text when the table has a specific meaning. */
  emptyLabel?: string;
}) {
  if (empty) {
    return (
      <EmptyState
        title={emptyLabel ?? "No records found"}
        description={
          emptyLabel
            ? ""
            : "Change the filters or create the first record."
        }
      />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}

export function ModuleState({
  title,
  description,
  loading,
  onRetry,
}: {
  title: string;
  description?: string;
  loading?: boolean;
  onRetry?: () => void;
}) {
  return (
    <section className="panel state-panel module-state-panel">
      {loading ? <div className="state-spinner" /> : <AlertCircle size={34} />}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {onRetry ? (
        <button className="secondary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </section>
  );
}

export function StatusPill({ value }: { value: string }) {
  return (
    <span className={`status-pill ${value.toLowerCase()}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

export function SalesPill({ type }: { type: SalesType }) {
  return (
    <span className={`sales-pill ${type.toLowerCase()}`}>
      {salesTypeLabel(type)}
    </span>
  );
}

export function WorkflowStep({
  number,
  label,
}: {
  number: string;
  label: string;
}) {
  return (
    <div>
      <span>{number}</span>
      <strong>{label}</strong>
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  size = "wide",
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
  size?: "wide" | "compact";
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className={`modal-card ${size === "compact" ? "module-modal-compact" : ""}`}
        role="dialog"
        aria-modal="true">
        <header>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="modal-close"
            type="button"
            aria-label="Close dialog"
            onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ModalActions({
  busy,
  label,
  onClose,
  disabled = false,
}: {
  busy: boolean;
  label: string;
  onClose: () => void;
  /** Blocks submission while the form is knowingly incomplete. */
  disabled?: boolean;
}) {
  return (
    <div className="modal-actions">
      <button
        className="secondary-button"
        type="button"
        disabled={busy}
        onClick={onClose}>
        Cancel
      </button>
      <button
        className="primary-button"
        type="submit"
        disabled={busy || disabled}>
        {busy ? "Saving…" : label}
      </button>
    </div>
  );
}

export function FormError({ error }: { error: string }) {
  return (
    <div className="form-error">
      <AlertCircle size={17} />
      {error}
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled,
  required = true,
  placeholder = "Select…",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; name: string }>;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <div className="select-shell">
        <select
          required={required}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}>
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <ChevronDown size={15} />
      </div>
    </label>
  );
}

export function Field({
  label,
  value,
  onChange,
  type = "text",
  min,
  step,
  required = true,
  disabled,
  placeholder,
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  min?: string;
  step?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        type={type}
        min={min}
        step={step}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

export function TextAreaField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <textarea
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type SaleLine = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

type PurchaseLine = {
  productId: string;
  quantity: number;
  unitCost: number;
  discount: number;
};

export function ProductLineEditor<T extends SaleLine | PurchaseLine>({
  mode,
  products,
  lines,
  setLines,
}: {
  mode: "sale" | "purchase";
  products: WorkspaceData["products"];
  lines: T[];
  setLines: (lines: T[]) => void;
}) {
  function update(index: number, field: string, value: string | number) {
    const next = lines.map((line, row) =>
      row === index ? { ...line, [field]: value } : line,
    ) as T[];

    if (field === "productId") {
      const product = products.find((item) => item.id === value);
      if (product && mode === "sale") {
        (next[index] as SaleLine).unitPrice = product.defaultPrice;
      }
      if (product && mode === "purchase") {
        (next[index] as PurchaseLine).unitCost = product.standardCost ?? 0;
      }
    }
    setLines(next);
  }

  function add() {
    const product = products[0];
    setLines([
      ...lines,
      {
        productId: product?.id ?? "",
        quantity: 1,
        discount: 0,
        ...(mode === "sale"
          ? { unitPrice: product?.defaultPrice ?? 0 }
          : { unitCost: product?.standardCost ?? 0 }),
      } as T,
    ]);
  }

  return (
    <div className="line-items">
      <div className="line-items-head">
        <h3>Products</h3>
        <button className="text-button" type="button" onClick={add}>
          <Plus size={14} />
          Add line
        </button>
      </div>
      {lines.map((line, index) => {
        const price =
          mode === "sale"
            ? (line as SaleLine).unitPrice
            : (line as PurchaseLine).unitCost;

        return (
          <div className="line-item-row compact-lines" key={index}>
            <span className="line-number">{index + 1}</span>
            <SelectField
              label="Product"
              value={line.productId}
              onChange={(value) => update(index, "productId", value)}
              options={products.map((product) => ({
                id: product.id,
                name: `${product.sku} — ${product.name}`,
              }))}
              placeholder="Select product"
            />
            <Field
              label="Qty"
              type="number"
              min="0.001"
              step="0.001"
              value={line.quantity}
              onChange={(value) => update(index, "quantity", Number(value))}
            />
            <Field
              label={mode === "sale" ? "Unit price" : "Unit cost"}
              type="number"
              min="0"
              value={price}
              onChange={(value) =>
                update(
                  index,
                  mode === "sale" ? "unitPrice" : "unitCost",
                  Number(value),
                )
              }
            />
            <Field
              label="Discount"
              type="number"
              min="0"
              value={line.discount}
              onChange={(value) => update(index, "discount", Number(value))}
            />
            <div className="line-total">
              <span>Total</span>
              <strong>
                {formatPkr(line.quantity * price - line.discount)}
              </strong>
            </div>
            <button
              className="remove-line"
              type="button"
              aria-label="Remove line"
              disabled={lines.length === 1}
              onClick={() => setLines(lines.filter((_, row) => row !== index))}>
              <Trash2 size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pagination-row">
      <span>
        Page {page} of {pages} · {total} record{total === 1 ? "" : "s"}
      </span>
      <div>
        <button
          className="secondary-button"
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}>
          Previous
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
