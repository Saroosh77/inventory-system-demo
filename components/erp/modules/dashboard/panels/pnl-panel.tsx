"use client";

import { formatPkr } from "@/lib/erp/format";
import type { WorkspaceData } from "@/lib/erp/types";

export default function PnlPanel({
  totals,
}: {
  totals: WorkspaceData["totals"];
}) {
  return (
    <article className="panel pnl-snapshot">
      <span className="panel-kicker">Company financial scope</span>
      <h2>
        {totals.companyGrossProfit === null
          ? "Restricted"
          : formatPkr(totals.companyGrossProfit)}
      </h2>
      <p>Gross profit from primary and direct sales only.</p>
      <dl>
        <div>
          <dt>Revenue excl. GST</dt>
          <dd>
            {totals.companyRevenue === null
              ? "Restricted"
              : formatPkr(totals.companyRevenue)}
          </dd>
        </div>
        <div>
          <dt>COGS</dt>
          <dd>
            {totals.companyCogs === null
              ? "Restricted"
              : formatPkr(totals.companyCogs)}
          </dd>
        </div>
        <div>
          <dt>Recovery ratio</dt>
          <dd>
            {totals.totalSales > 0
              ? `${Math.round((totals.totalRecovered / totals.totalSales) * 100)}%`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Secondary excluded</dt>
          <dd>{formatPkr(totals.secondarySales)}</dd>
        </div>
      </dl>
    </article>
  );
}
