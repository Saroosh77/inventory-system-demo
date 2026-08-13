"use client";

import {
  BarChart3,
  Boxes,
  FileCheck2,
  LayoutDashboard,
  KeyRound,
  LogOut,
  Menu,
  ReceiptText,
  Settings,
  Settings2,
  UserRound,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChangePasswordDialog } from "../auth/change-password-dialog-box";
import type {
  Actor,
  ErpAction,
  WorkspaceData,
} from "../../lib/erp/types";

const COMPANY_NAME =
  process.env.NEXT_PUBLIC_COMPANY_NAME ?? "Demo Foods";
const COMPANY_TAGLINE =
  process.env.NEXT_PUBLIC_COMPANY_TAGLINE ?? "Inventory & Distribution System";

const DashboardModule = dynamic(
  () => import("./modules/dashboard/dashboard-module"),
  {
    ssr: false,
    loading: () => <StatePanel title="Loading dashboard…" />,
  },
);
const InvoicesModule = dynamic(
  () => import("./modules/invoices/invoices-module"),
  {
    ssr: false,
    loading: () => <StatePanel title="Loading invoices…" />,
  },
);
const InventoryModule = dynamic(
  () => import("./modules/inventory/inventory-module"),
  {
    ssr: false,
    loading: () => <StatePanel title="Loading inventory…" />,
  },
);
const ReportsModule = dynamic(
  () => import("./modules/reports/reports-module"),
  {
    ssr: false,
    loading: () => <StatePanel title="Loading reports…" />,
  },
);
const AdministrationModule = dynamic(
  () => import("./modules/administration/administration-module"),
  {
    ssr: false,
    loading: () => <StatePanel title="Loading administration…" />,
  },
);

type SectionId =
  | "dashboard"
  | "inventory"
  | "invoices"
  | "reports"
  | "admin";
type NavigationItem = {
  id: SectionId;
  label: string;
  icon: typeof LayoutDashboard;
  permission?: string;
};
type SessionData = {
  actor: Actor;
  permissions: string[];
};

const navigation: NavigationItem[] = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  {
    id: "inventory",
    label: "Inventory",
    icon: Boxes,
    permission: "VIEW_INVENTORY",
  },
  {
    id: "invoices",
    label: "Invoices",
    icon: ReceiptText,
    permission: "VIEW_INVOICES",
  },
  {
    id: "reports",
    label: "P&L & Reports",
    icon: BarChart3,
    permission: "VIEW_PNL",
  },
  {
    id: "admin",
    label: "Administration",
    icon: Settings2,
    permission: "MANAGE_MASTER_DATA",
  },
];

export function ErpApp({ initialSession }: { initialSession: SessionData }) {
  const router = useRouter();
  const session = initialSession;
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>("dashboard");
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (
        accountMenuRef.current &&
        !accountMenuRef.current.contains(event.target as Node)
      ) {
        setAccountMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAccountMenuOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (activeSection === "admin") return;
    const controller = new AbortController();
    fetch(
      `/api/workspaces/${activeSection}`,
      {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 401) {
          router.replace("/login");
          throw new Error("Your session has expired.");
        }
        if (!response.ok)
          throw new Error(body.error ?? "Unable to load this module.");
        return body as WorkspaceData;
      })
      .then(setWorkspace)
      .catch((cause) => {
        if (cause instanceof DOMException && cause.name === "AbortError")
          return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to load this module.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setWorkspaceLoading(false);
    });
    return () => controller.abort();
  }, [activeSection, refreshVersion, router]);

  const allowedNavigation = useMemo(
    () =>
      navigation.filter(
        (item) =>
          !item.permission || session.permissions.includes(item.permission),
      ),
    [session],
  );
  const visibleSection = allowedNavigation.some(
    (item) => item.id === activeSection,
  )
    ? activeSection
    : "dashboard";

  async function submitAction(action: ErpAction) {
    const response = await fetch(actionEndpoint(action), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
      credentials: "same-origin",
    });
    const body = await response.json();
    if (response.status === 401) {
      router.replace("/login");
      throw new Error("Your session has expired.");
    }
    if (!response.ok)
      throw new Error(body.error ?? "The transaction could not be saved.");
    showNotice(successMessage(action.action, body.data));
    setRefreshVersion((version) => version + 1);
    return body.data;
  }

  async function logout() {
    setLogoutBusy(true);
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  function passwordChanged() {
    router.replace("/login");
    router.refresh();
  }

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(null), 4500);
  }

  function navigate(section: SectionId) {
    setWorkspace(null);
    setError(null);
    setWorkspaceLoading(section !== "admin");
    setActiveSection(section);
    setMobileOpen(false);
  }

  return (
    <div className="erp-shell">
      <aside className={`sidebar ${mobileOpen ? "sidebar-open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div>
            <strong>{COMPANY_NAME}</strong>
            <p>{COMPANY_TAGLINE}</p>
          </div>
          <button
            className="mobile-close"
            type="button"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}>
            <X size={21} />
          </button>
        </div>
        <nav className="primary-nav" aria-label="Main navigation">
          {allowedNavigation.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={visibleSection === item.id ? "active" : ""}
                onClick={() => navigate(item.id)}>
                <Icon size={20} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-account-wrap" ref={accountMenuRef}>
          {accountMenuOpen ? (
            <div className="account-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setPasswordDialogOpen(true);
                }}>
                <KeyRound size={15} />
                Change password
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => void logout()}
                disabled={logoutBusy}>
                <LogOut size={15} />
                {logoutBusy ? "Signing out…" : "Sign out"}
              </button>
            </div>
          ) : null}
          <div className="sidebar-account">
            <span className="avatar">
              <UserRound size={14} />
            </span>
            <strong>{session.actor.name}</strong>
            <span className="sidebar-account-role">
              {roleLabel(session.actor.role)}
            </span>
            <button
              type="button"
              className="account-trigger"
              aria-haspopup="true"
              aria-expanded={accountMenuOpen}
              aria-label="Account menu"
              onClick={() => setAccountMenuOpen((open) => !open)}>
              <Settings
                size={13}
                className={`account-trigger-icon ${accountMenuOpen ? "open" : ""}`}
              />
            </button>
          </div>
        </div>
      </aside>
      {mobileOpen ? (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      ) : null}

      <main className="main-content">
        <header className="topbar">
          <div className="heading-row">
            <button
              className="mobile-menu"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}>
              <Menu size={22} />
            </button>
            <div>
              <p className="eyebrow">Role-secured operations workspace</p>
              <h1>
                {navigation.find((item) => item.id === visibleSection)?.label}
              </h1>
              <p>{sectionDescription(visibleSection)}</p>
            </div>
          </div>
        </header>

        {error && !workspace && !workspaceLoading ? (
          <StatePanel title="This module is unavailable" description={error} />
        ) : null}
        {visibleSection === "admin" ? (
          <AdministrationModule
            notify={showNotice}
          />
        ) : null}
        {visibleSection !== "admin" && workspaceLoading ? (
          <StatePanel
            title={`Loading ${navigation.find((item) => item.id === visibleSection)?.label.toLowerCase()}…`}
          />
        ) : null}
        {workspace && visibleSection === "dashboard" ? (
          <DashboardModule workspace={workspace} onNavigate={navigate} />
        ) : null}
        {workspace && visibleSection === "invoices" ? (
          <InvoicesModule workspace={workspace} onAction={submitAction} />
        ) : null}
        {workspace && visibleSection === "inventory" ? (
          <InventoryModule
            workspace={workspace}
            notify={showNotice}
            refreshVersion={refreshVersion}
            requestRefresh={() =>
              setRefreshVersion((version) => version + 1)
            }
          />
        ) : null}
        {workspace && visibleSection === "reports" ? (
          <ReportsModule refreshVersion={refreshVersion} />
        ) : null}
      </main>
      {notice ? (
        <div className="toast-success">
          <FileCheck2 size={18} />
          {notice}
        </div>
      ) : null}
      {passwordDialogOpen ? (
      <ChangePasswordDialog
        onClose={() => setPasswordDialogOpen(false)}
        onChanged={passwordChanged}
      />
      ) : null}
    </div>
  );
}

function actionEndpoint(action: ErpAction) {
  switch (action.action) {
    case "cancelInvoice":
      return `/api/sales/invoices/${action.invoiceId}/cancel`;
    default:
      throw new Error("Master-data changes must use the Master Data module.");
  }
}

function StatePanel({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <section className="panel state-panel">
      <div className="state-spinner" />
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </section>
  );
}

function roleLabel(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}
function sectionDescription(section: SectionId) {
  const descriptions: Record<SectionId, string> = {
    dashboard: "Sales, stock and margin activity, filtered to your role.",
    inventory: "Warehouse and product stock with raw-material privacy.",
    invoices: "Finance-approved GST and non-GST invoices.",
    reports: "Company P&L excludes secondary sales by design.",
    admin:
      "Add, edit, reactivate and safely deactivate controlled master data.",
  };
  return descriptions[section];
}

function successMessage(
  action: ErpAction["action"],
  result: Record<string, string>,
) {
  const labels: Record<ErpAction["action"], string> = {
    cancelInvoice: `Invoice ${result.invoiceNumber ?? ""} cancelled${result.stockRestored ? " and stock returned" : ""}`,
  };
  return labels[action] ?? "Saved successfully";
}
