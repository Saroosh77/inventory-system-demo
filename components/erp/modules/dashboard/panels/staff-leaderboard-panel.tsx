"use client";

import { formatPkr } from "@/lib/erp/format";
import type { WorkspaceData } from "@/lib/erp/types";
import { DataTable, WorkspaceHeading } from "../../../ui/module-ui";

export default function StaffLeaderboardPanel({
  staff,
  staffPerformance,
}: {
  staff: WorkspaceData["staff"];
  staffPerformance: WorkspaceData["staffPerformance"];
}) {
  const staffName = new Map(staff.map((row) => [row.id, row.name]));
  const top = [...staffPerformance]
    .sort((a, b) => b.recovery - a.recovery)
    .slice(0, 5);

  return (
    <article className="panel workspace-panel">
      <WorkspaceHeading kicker="Field performance" title="Top staff by recovery" />
      <DataTable
        empty={!top.length}
        headers={["Staff", "Invoices", "Sales", "Recovery"]}>
        {top.map((row) => (
          <tr key={row.staffId}>
            <td>{staffName.get(row.staffId) ?? row.staffId}</td>
            <td>{row.invoicesPosted}</td>
            <td className="amount-cell">{formatPkr(row.salesAmount)}</td>
            <td className="amount-cell recovered">{formatPkr(row.recovery)}</td>
          </tr>
        ))}
      </DataTable>
    </article>
  );
}
