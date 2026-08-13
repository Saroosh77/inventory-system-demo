"use client";

import { ChevronLeft, ChevronRight, CircleDollarSign, MapPin } from "lucide-react";
import { useMemo, useState } from "react";
import { queryString } from "@/lib/client/erp-api";
import { useErpData } from "@/lib/client/use-erp-query";
import { today } from "@/lib/client/date-utils";
import { formatPkr } from "@/lib/erp/format";
import type { WorkspaceData } from "@/lib/erp/types";
import {
  DataTable,
  ModuleState,
  ModuleTabs,
  WorkspaceHeading,
} from "../../ui/module-ui";

type DatePreset = "weekly" | "biweekly" | "monthly" | "history";

type ReportsPanel =
  | "pnl"
  | "bookers"
  | "distributors"
  | "routes"
  | "trial-balance"
  | "balance-sheet";

const PRESET_OPTIONS: Array<[DatePreset, string]> = [
  ["weekly", "Weekly"],
  ["biweekly", "Bi Weekly"],
  ["monthly", "Monthly"],
  ["history", "Full History"],
];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The Monday on or before the given date, in the same UTC-date arithmetic the rest of this file uses. */
function mondayOnOrBefore(date: Date): Date {
  const result = new Date(date);
  const day = result.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  result.setUTCDate(result.getUTCDate() - diff);
  return result;
}

/**
 * Computes a period window `offset` steps back from the current one — like
 * flipping between months on a flight-price calendar. offset 0 is always
 * the period containing today; each step back is one whole period earlier,
 * so navigating never produces overlapping or drifting windows.
 */
function presetRange(preset: DatePreset, offset: number): { from: string; to: string } {
  if (preset === "history") return { from: "", to: "" };

  const anchor = new Date(`${today()}T00:00:00.000Z`);

  if (preset === "monthly") {
    const monthStart = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - offset, 1),
    );
    const monthEnd = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    );
    return { from: isoDate(monthStart), to: isoDate(monthEnd) };
  }

  const currentWeekStart = mondayOnOrBefore(anchor);
  if (preset === "weekly") {
    const from = new Date(currentWeekStart);
    from.setUTCDate(from.getUTCDate() - offset * 7);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 6);
    return { from: isoDate(from), to: isoDate(to) };
  }

  // Biweekly: contiguous 14-day blocks. offset 0 covers this week and the
  // one before it, so the "current" block always includes today.
  const from = new Date(currentWeekStart);
  from.setUTCDate(from.getUTCDate() - 7 - offset * 14);
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 13);
  return { from: isoDate(from), to: isoDate(to) };
}

function presetLabel(preset: DatePreset, from: string, to: string): string {
  if (preset === "history" || !from || !to) return "";
  const fromDate = new Date(`${from}T00:00:00.000Z`);
  const toDate = new Date(`${to}T00:00:00.000Z`);

  if (preset === "monthly") {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(fromDate);
  }

  const dayMonth = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const dayMonthYear = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  return `${dayMonth.format(fromDate)} – ${dayMonthYear.format(toDate)}`;
}

export default function ReportsModule({
  refreshVersion,
}: {
  refreshVersion: number;
}) {
  const [panel, setPanel] = useState<ReportsPanel>("pnl");
  // null means the From/To fields were edited by hand, so no preset button
  // is highlighted and period navigation is hidden.
  const [preset, setPreset] = useState<DatePreset | null>("history");
  const [offset, setOffset] = useState(0);
  // dateFrom/dateTo are the applied filter that actually drives the fetch.
  // draftFrom/draftTo are what the From/To inputs show while typing — kept
  // separate so picking a date (or bumping the native date-input's
  // up/down spinner) doesn't refetch on every keystroke. Presets and period
  // navigation set both at once, since choosing "Weekly" or clicking the
  // arrow is a single deliberate action with no partial state to protect
  // against; only manual From/To editing needs the draft/apply split.
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");

  const url = useMemo(
    () => `/api/workspaces/reports${queryString({ dateFrom, dateTo })}`,
    [dateFrom, dateTo],
  );
  const { data, error, loading, reload } = useErpData<WorkspaceData>(
    url,
    refreshVersion,
  );

  function choosePreset(value: DatePreset) {
    setPreset(value);
    setOffset(0);
    const range = presetRange(value, 0);
    setDateFrom(range.from);
    setDateTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  }

  function stepPeriod(direction: 1 | -1) {
    if (!preset || preset === "history") return;
    const nextOffset = Math.max(0, offset + direction);
    if (nextOffset === offset) return;
    setOffset(nextOffset);
    const range = presetRange(preset, nextOffset);
    setDateFrom(range.from);
    setDateTo(range.to);
    setDraftFrom(range.from);
    setDraftTo(range.to);
  }

  function editDraftDate(which: "from" | "to", value: string) {
    setPreset(null);
    setOffset(0);
    if (which === "from") setDraftFrom(value);
    else setDraftTo(value);
  }

  function applyCustomRange() {
    setDateFrom(draftFrom);
    setDateTo(draftTo);
  }

  function clearFilter() {
    setPreset(null);
    setOffset(0);
    setDateFrom("");
    setDateTo("");
    setDraftFrom("");
    setDraftTo("");
  }

  const hasFilter =
    Boolean(dateFrom) || Boolean(dateTo) || Boolean(draftFrom) || Boolean(draftTo);
  const canApply =
    Boolean(draftFrom) &&
    Boolean(draftTo) &&
    (draftFrom !== dateFrom || draftTo !== dateTo);

  if (loading && !data) {
    return <ModuleState title="Loading reports…" loading />;
  }
  if (error && !data) {
    return (
      <ModuleState
        title="Reports are unavailable"
        description={error}
        onRetry={reload}
      />
    );
  }
  if (!data) return null;

  const staffById = new Map(data.staff.map((row) => [row.id, row]));
  const distributorById = new Map(
    data.distributors.map((row) => [row.id, row]),
  );
  const routeById = new Map(data.routes.map((row) => [row.id, row]));

  return (
    <div className="workspace-stack">
      <section className="panel workspace-panel">
        <WorkspaceHeading
          kicker="Period"
          title="Report period"
          description="Every panel below reflects this period, except the trial balance and balance sheet, which are always cumulative as of the end date. Leave it on Full History to see everything ever posted."
        />
        <div className="period-toggle">
          {PRESET_OPTIONS.map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={preset === value ? "selected" : ""}
              onClick={() => choosePreset(value)}>
              {label}
            </button>
          ))}
        </div>
        {preset && preset !== "history" ? (
          <div className="period-nav">
            <button
              type="button"
              onClick={() => stepPeriod(1)}
              aria-label="Previous period">
              <ChevronLeft size={15} />
            </button>
            <span>{presetLabel(preset, dateFrom, dateTo)}</span>
            <button
              type="button"
              onClick={() => stepPeriod(-1)}
              disabled={offset === 0}
              aria-label="Next period">
              <ChevronRight size={15} />
            </button>
          </div>
        ) : null}
        <div className="module-toolbar">
          <label>
            <span>From</span>
            <input
              type="date"
              value={draftFrom}
              max={draftTo || undefined}
              onChange={(event) => editDraftDate("from", event.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={draftTo}
              min={draftFrom || undefined}
              onChange={(event) => editDraftDate("to", event.target.value)}
            />
          </label>
          <div className="period-actions">
            <button
              type="button"
              className="primary-button small"
              disabled={!canApply}
              onClick={applyCustomRange}>
              Apply
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={!hasFilter}
              onClick={clearFilter}>
              Clear
            </button>
          </div>
        </div>
      </section>

      <ModuleTabs
        active={panel}
        onChange={setPanel}
        tabs={[
          { id: "pnl", label: "Company P&L" },
          { id: "bookers", label: "By Booker", count: data.staffPerformance.length },
          {
            id: "distributors",
            label: "By Distributor",
            count: data.distributorPerformance.length,
          },
          { id: "routes", label: "By Route", count: data.routePerformance.length },
          {
            id: "trial-balance",
            label: "Trial Balance",
            count: data.ledger.trialBalance.rows.length,
          },
          { id: "balance-sheet", label: "Balance Sheet" },
        ]}
      />

      {panel === "pnl" ? (
        <>
          <section className="report-callout panel">
            <div>
              <span className="panel-kicker">Company P&amp;L boundary</span>
              <h2>{formatPkr(data.totals.companyGrossProfit ?? 0)}</h2>
              <p>
                Gross profit uses primary and direct invoice revenue excluding
                GST, less their cost snapshots. Secondary sales remain
                operational records and never enter company revenue.
              </p>
            </div>
            <CircleDollarSign size={56} />
          </section>
          <section className="pnl-grid">
            <ReportMetric
              label="Primary revenue"
              value={data.totals.primarySales}
            />
            <ReportMetric
              label="Direct revenue"
              value={data.totals.directSales}
            />
            <ReportMetric
              label="Secondary monitoring"
              value={data.totals.secondarySales}
              className="excluded"
              note="Excluded from P&L"
            />
            <ReportMetric
              label="Company COGS"
              value={data.totals.companyCogs ?? 0}
            />
            <ReportMetric
              label="Output GST liability"
              value={data.totals.outputTax ?? 0}
            />
            <ReportMetric
              label="Company gross profit"
              value={data.totals.companyGrossProfit ?? 0}
              className="profit"
            />
          </section>
        </>
      ) : null}

      {panel === "bookers" ? (
        <section className="panel workspace-panel">
          <WorkspaceHeading
            kicker="Field performance"
            title="Sales and recovery by booker"
          />
          <DataTable
            empty={!data.staffPerformance.length}
            headers={["Booker", "Invoices", "Sales", "Recovery"]}>
            {data.staffPerformance.map((row) => (
              <tr key={row.staffId}>
                <td>{staffById.get(row.staffId)?.name ?? row.staffId}</td>
                <td>{row.invoicesPosted}</td>
                <td className="amount-cell">{formatPkr(row.salesAmount)}</td>
                <td className="amount-cell recovered">
                  {formatPkr(row.recovery)}
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : null}

      {panel === "distributors" ? (
        <section className="panel workspace-panel">
          <WorkspaceHeading
            kicker="Channel performance"
            title="Sales and recovery by distributor"
            description="Distributor accounts are secondary-sale customers as well as the destination of primary sales; this reflects invoices attributed to each."
          />
          <DataTable
            empty={!data.distributorPerformance.length}
            headers={["Distributor", "Invoices", "Sales", "Recovery"]}>
            {data.distributorPerformance.map((row) => (
              <tr key={row.distributorId}>
                <td>
                  {distributorById.get(row.distributorId)?.name ??
                    row.distributorId}
                </td>
                <td>{row.invoicesPosted}</td>
                <td className="amount-cell">{formatPkr(row.salesAmount)}</td>
                <td className="amount-cell recovered">
                  {formatPkr(row.recovery)}
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : null}

      {panel === "routes" ? (
        <section className="panel workspace-panel">
          <WorkspaceHeading
            kicker="Field coverage"
            title="Sales and recovery by route"
            description="Every invoice and recovery carries the route it was booked on, so a territory's contribution is reported without any separate route reporting step."
          />
          <DataTable
            empty={!data.routePerformance.length}
            headers={[
              "Route",
              "Customers",
              "Invoices",
              "Sales",
              "Recovery",
            ]}>
            {data.routePerformance.map((row) => (
              <tr key={row.routeId}>
                <td>{routeById.get(row.routeId)?.name ?? row.routeId}</td>
                <td>
                  <span className="location-proof">
                    <MapPin size={13} />
                    {row.assignedCustomers}
                  </span>
                </td>
                <td>{row.invoicesPosted}</td>
                <td className="amount-cell">{formatPkr(row.salesAmount)}</td>
                <td className="amount-cell recovered">
                  {formatPkr(row.recovery)}
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      ) : null}

      {panel === "trial-balance" ? (
        <section className="panel workspace-panel">
          <WorkspaceHeading
            kicker="Accounting"
            title="Trial balance"
            description="Every account the general ledger has posted to, as of the end of the selected period. Debit and credit totals are always equal — the posting engine cannot produce an imbalanced entry."
          />
          <DataTable
            empty={!data.ledger.trialBalance.rows.length}
            emptyLabel="Nothing posted to the ledger yet"
            headers={["Code", "Account", "Type", "Debit", "Credit"]}>
            {data.ledger.trialBalance.rows.map((row) => (
              <tr key={row.accountId}>
                <td>{row.code}</td>
                <td>{row.name}</td>
                <td>{row.type}</td>
                <td className="amount-cell">{formatPkr(row.debit)}</td>
                <td className="amount-cell">{formatPkr(row.credit)}</td>
              </tr>
            ))}
            {data.ledger.trialBalance.rows.length ? (
              <tr className="totals-row">
                <td colSpan={3}>Totals</td>
                <td className="amount-cell">
                  {formatPkr(data.ledger.trialBalance.totalDebit)}
                </td>
                <td className="amount-cell">
                  {formatPkr(data.ledger.trialBalance.totalCredit)}
                </td>
              </tr>
            ) : null}
          </DataTable>
        </section>
      ) : null}

      {panel === "balance-sheet" ? (
        <section className="panel workspace-panel">
          <WorkspaceHeading
            kicker="Accounting"
            title="Balance sheet"
            description="Company scope only — distributor warehouses and secondary sales never enter the company ledger, same as the P&L above. Current period earnings fold into equity until a formal period close exists."
          />
          <div className="balance-sheet-grid">
            <div>
              <h3>Assets</h3>
              <DataTable
                empty={!data.ledger.balanceSheet.assets.rows.length}
                headers={["Account", "Balance"]}>
                {data.ledger.balanceSheet.assets.rows.map((row) => (
                  <tr key={row.accountId}>
                    <td>{row.name}</td>
                    <td className="amount-cell">
                      {formatPkr(row.debit - row.credit)}
                    </td>
                  </tr>
                ))}
                <tr className="totals-row">
                  <td>Total assets</td>
                  <td className="amount-cell">
                    {formatPkr(data.ledger.balanceSheet.assets.total)}
                  </td>
                </tr>
              </DataTable>
            </div>
            <div>
              <h3>Liabilities</h3>
              <DataTable
                empty={!data.ledger.balanceSheet.liabilities.rows.length}
                headers={["Account", "Balance"]}>
                {data.ledger.balanceSheet.liabilities.rows.map((row) => (
                  <tr key={row.accountId}>
                    <td>{row.name}</td>
                    <td className="amount-cell">
                      {formatPkr(row.credit - row.debit)}
                    </td>
                  </tr>
                ))}
                <tr className="totals-row">
                  <td>Total liabilities</td>
                  <td className="amount-cell">
                    {formatPkr(data.ledger.balanceSheet.liabilities.total)}
                  </td>
                </tr>
              </DataTable>
              <h3>Equity</h3>
              <DataTable
                empty={!data.ledger.balanceSheet.equity.rows.length}
                emptyLabel="No equity accounts posted yet"
                headers={["Account", "Balance"]}>
                {data.ledger.balanceSheet.equity.rows.map((row) => (
                  <tr key={row.accountId}>
                    <td>{row.name}</td>
                    <td className="amount-cell">
                      {formatPkr(row.credit - row.debit)}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td>Current period earnings</td>
                  <td className="amount-cell">
                    {formatPkr(data.ledger.balanceSheet.currentPeriodEarnings)}
                  </td>
                </tr>
                <tr className="totals-row">
                  <td>Total liabilities + equity</td>
                  <td className="amount-cell">
                    {formatPkr(
                      data.ledger.balanceSheet.totalLiabilitiesAndEquity,
                    )}
                  </td>
                </tr>
              </DataTable>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReportMetric({
  label,
  value,
  className,
  note,
}: {
  label: string;
  value: number;
  className?: string;
  note?: string;
}) {
  return (
    <article className={`panel ${className ?? ""}`}>
      <span>{label}</span>
      <strong>{formatPkr(value)}</strong>
      {note ? <small>{note}</small> : null}
    </article>
  );
}
