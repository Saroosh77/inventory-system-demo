"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { formatPkr } from "@/lib/erp/format";
import type { WorkspaceData } from "@/lib/erp/types";
import { WorkspaceHeading } from "../../../ui/module-ui";

const COLORS = {
  primary: "#1557f0",
  secondary: "#8390a7",
  direct: "#0f9d98",
} as const;

export default function ChannelMixDonut({
  totals,
}: {
  totals: WorkspaceData["totals"];
}) {
  const data = [
    { key: "primary" as const, label: "Primary", value: totals.primarySales },
    {
      key: "secondary" as const,
      label: "Secondary",
      value: totals.secondarySales,
    },
    { key: "direct" as const, label: "Direct", value: totals.directSales },
  ];
  const total = Math.max(
    1,
    totals.primarySales + totals.secondarySales + totals.directSales,
  );

  return (
    <article className="panel workspace-panel">
      <WorkspaceHeading
        kicker="Mix"
        title="Channel mix"
        description="Share of total sales, all time."
      />
      <div className="channel-mix">
        <div className="dashboard-donut">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="100%"
                paddingAngle={2}>
                {data.map((entry) => (
                  <Cell key={entry.key} fill={COLORS[entry.key]} />
                ))}
              </Pie>
              <Tooltip formatter={(value) => formatPkr(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <ul className="channel-legend">
          {data.map((entry) => (
            <li key={entry.key}>
              <span
                className="legend-dot"
                style={{ background: COLORS[entry.key] }}
              />
              <span>{entry.label}</span>
              <strong>{Math.round((entry.value / total) * 100)}%</strong>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
