"use client";

import {
  AlertTriangle,
  Boxes,
  CircleDollarSign,
  PackageCheck,
  Percent,
  ReceiptText,
  RefreshCcw,
  Wallet2,
} from "lucide-react";
import type { ComponentType } from "react";
import { formatPkr } from "@/lib/erp/format";
import type { WorkspaceData } from "@/lib/erp/types";
import ChannelMixDonut from "./panels/channel-mix-donut";
import NearExpiryPanel from "./panels/near-expiry-panel";
import PnlPanel from "./panels/pnl-panel";
import RecentInvoicesPanel from "./panels/recent-invoices-panel";
import StaffLeaderboardPanel from "./panels/staff-leaderboard-panel";
import WarehouseOverviewPanel from "./panels/warehouse-overview-panel";
import WeeklyTrendChart from "./panels/weekly-trend-chart";

type NavigateTarget = "inventory" | "invoices" | "reports";

export default function DashboardModule({
  workspace,
  onNavigate,
}: {
  workspace: WorkspaceData;
  onNavigate: (section: NavigateTarget) => void;
}) {
  return (
    <div className="workspace-stack">
      <RoleMetrics workspace={workspace} onNavigate={onNavigate} />
      <RoleDashboard workspace={workspace} />
    </div>
  );
}

function RoleMetrics({
  workspace,
  onNavigate,
}: {
  workspace: WorkspaceData;
  onNavigate: (section: NavigateTarget) => void;
}) {
  const { actor, totals, stock, nearExpiry } = workspace;
  const stockUnits = stock.reduce((sum, row) => sum + row.quantity, 0);
  const expiringBatches = nearExpiry.reduce((sum, row) => sum + row.count, 0);
  const recoveryRatio =
    totals.totalSales > 0
      ? Math.round((totals.totalRecovered / totals.totalSales) * 100)
      : 0;

  let metrics: Array<{
    label: string;
    value: string;
    detail: string;
    icon: ComponentType<{ size?: number }>;
    target: NavigateTarget;
  }>;

  switch (actor.role) {
    case "WAREHOUSE_STAFF":
      metrics = [
        {
          label: "Stock units",
          value: stockUnits.toLocaleString(),
          detail: "My warehouse",
          icon: Boxes,
          target: "inventory",
        },
        {
          label: "Expiring batches",
          value: String(expiringBatches),
          detail: "Within 90 days",
          icon: AlertTriangle,
          target: "inventory",
        },
        {
          label: "Warehouses in scope",
          value: String(stock.length),
          detail: "Assigned to me",
          icon: PackageCheck,
          target: "inventory",
        },
      ];
      break;
    case "FINANCE":
      metrics = [
        {
          label: "Outstanding recovery",
          value: formatPkr(totals.totalOutstanding, true),
          detail: "Across visible invoices",
          icon: RefreshCcw,
          target: "invoices",
        },
        {
          label: "Recovered",
          value: formatPkr(totals.totalRecovered, true),
          detail: "All time",
          icon: Wallet2,
          target: "invoices",
        },
        {
          label: "Recovery ratio",
          value: `${recoveryRatio}%`,
          detail: "Recovered of total sales",
          icon: Percent,
          target: "reports",
        },
        {
          label: "Company gross profit",
          value:
            totals.companyGrossProfit === null
              ? "Restricted"
              : formatPkr(totals.companyGrossProfit, true),
          detail: "Primary + direct only",
          icon: CircleDollarSign,
          target: "reports",
        },
      ];
      break;
    case "ADMIN":
    default:
      metrics = [
        {
          label: "Total sales",
          value: formatPkr(totals.totalSales, true),
          detail: "All channels, all time",
          icon: ReceiptText,
          target: "invoices",
        },
        {
          label: "Outstanding recovery",
          value: formatPkr(totals.totalOutstanding, true),
          detail: "Across visible invoices",
          icon: RefreshCcw,
          target: "invoices",
        },
        {
          label: "Visible stock units",
          value: stockUnits.toLocaleString(),
          detail: "Role-filtered inventory",
          icon: PackageCheck,
          target: "inventory",
        },
        {
          label: "Company gross profit",
          value:
            totals.companyGrossProfit === null
              ? "Restricted"
              : formatPkr(totals.companyGrossProfit, true),
          detail: "Primary + direct only",
          icon: CircleDollarSign,
          target: "reports",
        },
      ];
      break;
  }

  return (
    <section className={`metric-grid ${metrics.length === 3 ? "metric-grid-3" : ""}`}>
      {metrics.map((metric) => (
        <DashboardMetric key={metric.label} {...metric} onClick={() => onNavigate(metric.target)} />
      ))}
    </section>
  );
}

function RoleDashboard({ workspace }: { workspace: WorkspaceData }) {
  const { actor } = workspace;

  if (actor.role === "WAREHOUSE_STAFF") {
    return (
      <section className="dashboard-grid dashboard-grid-v3">
        <WarehouseOverviewPanel
          stock={workspace.stock}
          nearExpiry={workspace.nearExpiry}
        />
        <NearExpiryPanel
          warehouses={workspace.warehouses}
          nearExpiry={workspace.nearExpiry}
        />
      </section>
    );
  }

  return (
    <>
      <section className="dashboard-grid dashboard-grid-v3">
        <WeeklyTrendChart salesTrend={workspace.salesTrend} />
        <ChannelMixDonut totals={workspace.totals} />
      </section>
      <section className="dashboard-grid dashboard-grid-v3">
        <WarehouseOverviewPanel
          stock={workspace.stock}
          nearExpiry={workspace.nearExpiry}
        />
        <PnlPanel totals={workspace.totals} />
      </section>
      <section className="dashboard-grid dashboard-grid-v3">
        <RecentInvoicesPanel invoices={workspace.invoices} />
        <StaffLeaderboardPanel
          staff={workspace.staff}
          staffPerformance={workspace.staffPerformance}
        />
      </section>
    </>
  );
}

function DashboardMetric({
  label,
  value,
  detail,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ComponentType<{ size?: number }>;
  onClick: () => void;
}) {
  return (
    <button className="metric-card metric-button" type="button" onClick={onClick}>
      <span className="metric-icon">
        <Icon size={22} />
      </span>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </button>
  );
}
