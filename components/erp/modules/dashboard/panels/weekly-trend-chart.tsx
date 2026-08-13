"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPkr } from "@/lib/erp/format";
import type { WorkspaceData } from "@/lib/erp/types";
import { WorkspaceHeading } from "../../../ui/module-ui";

export default function WeeklyTrendChart({
  salesTrend,
}: {
  salesTrend: WorkspaceData["salesTrend"];
}) {
  return (
    <article className="panel workspace-panel">
      <WorkspaceHeading
        kicker="Trend"
        title="Weekly sales by channel"
        description="Last 8 weeks, taxable amount by sales type."
      />
      <div className="dashboard-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={salesTrend}
            margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--line)"
              vertical={false}
            />
            <XAxis
              dataKey="weekLabel"
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(value) => formatPkr(Number(value), true)}
              tick={{ fontSize: 10, fill: "var(--muted)" }}
              axisLine={false}
              tickLine={false}
              width={64}
            />
            <Tooltip formatter={(value) => formatPkr(Number(value))} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar
              dataKey="primary"
              name="Primary"
              stackId="sales"
              fill="#1557f0"
            />
            <Bar
              dataKey="secondary"
              name="Secondary"
              stackId="sales"
              fill="#8390a7"
            />
            <Bar
              dataKey="direct"
              name="Direct"
              stackId="sales"
              fill="#0f9d98"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
