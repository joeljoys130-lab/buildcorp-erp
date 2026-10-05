"use client";

import React, { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  AreaChart, Area
} from "recharts";
import { ChartCard } from "./chart-card";
import { CustomTooltip } from "./custom-tooltip";
import { Entry, PrivateWork, Expense } from "@/lib/types";

// =========================================================================
// 1. PROJECT / WORK STATUS OVERVIEW (Donut Chart)
// =========================================================================

interface ProjectStatusChartProps {
  entries: Entry[];
  privateWorks: PrivateWork[];
}

const STATUS_COLORS: Record<string, string> = {
  Ongoing: "#171717",       // Deep charcoal/black
  Completed: "#059669",     // Emerald
  Pending: "#d97706",       // Amber
  "Not Started": "#737373", // Slate gray
};

export const ProjectStatusChart: React.FC<ProjectStatusChartProps> = ({
  entries = [],
  privateWorks = [],
}) => {
  const chartData = useMemo(() => {
    const ongoingCount =
      entries.filter((e) => e.status === "Ongoing").length + privateWorks.length;
    const completedCount = entries.filter((e) => e.status === "Completed").length;
    const pendingCount = entries.filter((e) => e.status === "Pending").length;
    const notStartedCount = entries.filter((e) => e.status === "Not Started").length;

    const data = [
      { name: "Ongoing", count: ongoingCount, fill: STATUS_COLORS.Ongoing },
      { name: "Completed", count: completedCount, fill: STATUS_COLORS.Completed },
      { name: "Pending", count: pendingCount, fill: STATUS_COLORS.Pending },
      { name: "Not Started", count: notStartedCount, fill: STATUS_COLORS["Not Started"] },
    ].filter((item) => item.count > 0);

    return data;
  }, [entries, privateWorks]);

  const totalWorks = useMemo(
    () => chartData.reduce((sum, item) => sum + item.count, 0),
    [chartData]
  );

  return (
    <ChartCard
      title="Work Pipeline & Execution Status"
      subtitle={`${totalWorks} total contracts & private works in database`}
      isEmpty={chartData.length === 0}
      emptyMessage="No works found in database."
      height="auto"
      className="min-h-[320px] sm:min-h-[260px]"
    >
      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 min-w-0">
        {/* Pie graphic container with guaranteed dimensions */}
        <div className="w-full sm:w-1/2 h-[190px] relative min-w-0 flex items-center justify-center">
          <ResponsiveContainer width="100%" height={190} minWidth={0}>
            <PieChart>
              <Tooltip
                content={
                  <CustomTooltip
                    currency={false}
                    unit="Works"
                    titlePrefix="Status"
                  />
                }
              />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={46}
                outerRadius={72}
                paddingAngle={3}
                stroke="#fff"
                strokeWidth={2}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono text-xl font-bold text-black">{totalWorks}</span>
            <span className="text-[9px] uppercase font-bold text-neutral-400">Total</span>
          </div>
        </div>

        {/* Legend table */}
        <div className="w-full sm:w-1/2 space-y-1.5 min-w-0 sm:pr-2">
          {chartData.map((item) => {
            const percent = totalWorks > 0 ? ((item.count / totalWorks) * 100).toFixed(0) : "0";
            return (
              <div
                key={item.name}
                className="flex items-center justify-between py-1 border-b border-neutral-100 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: item.fill }}
                  />
                  <span className="font-medium text-neutral-700 text-[11px] truncate">{item.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="font-mono font-bold text-black text-[11px]">{item.count}</span>
                  <span className="text-[10px] text-neutral-400 font-mono w-8 text-right">
                    {percent}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
};

// =========================================================================
// 2. FINANCIAL HEALTH OVERVIEW (Bar Chart)
// =========================================================================

interface FinancialOverviewChartProps {
  portfolioValuation: number;
  totalExpenses: number;
  projectedProfit: number;
  realizedProfit: number;
}

export const FinancialOverviewChart: React.FC<FinancialOverviewChartProps> = ({
  portfolioValuation,
  totalExpenses,
  projectedProfit,
  realizedProfit,
}) => {
  const chartData = useMemo(() => {
    return [
      {
        name: "Valuation",
        amount: portfolioValuation,
        fill: "#171717",
      },
      {
        name: "Expenses",
        amount: totalExpenses,
        fill: "#ef4444",
      },
      {
        name: "Proj. Profit",
        amount: Math.max(0, projectedProfit),
        fill: "#2563eb",
      },
      {
        name: "Realized Cash",
        amount: Math.max(0, realizedProfit),
        fill: "#059669",
      },
    ];
  }, [portfolioValuation, totalExpenses, projectedProfit, realizedProfit]);

  const isEmpty = portfolioValuation === 0 && totalExpenses === 0;

  return (
    <ChartCard
      title="Portfolio Financial Position"
      subtitle="Total Valuation, Operational Expenses & Profitability (INR)"
      isEmpty={isEmpty}
      emptyMessage="No financial valuation records available."
      height={250}
    >
      <div className="w-full h-[250px] min-w-0">
        <ResponsiveContainer width="100%" height={250} minWidth={0}>
          <BarChart
            data={chartData}
            margin={{ top: 15, right: 10, left: -10, bottom: 25 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 10, fill: "#525252" }}
              axisLine={{ stroke: "#e5e5e5" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#737373" }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(val) => {
                if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
                if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
                return `₹${val}`;
              }}
            />
            <Tooltip
              content={<CustomTooltip currency={true} titlePrefix="Metric" />}
            />
            <Bar dataKey="amount" name="Amount" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`bar-${index}`} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

// =========================================================================
// 3. EXPENSE TREND OVER TIME (Monthly Area Chart)
// =========================================================================

interface ExpenseTrendChartProps {
  expenses: Expense[];
}

export const ExpenseTrendChart: React.FC<ExpenseTrendChartProps> = ({
  expenses = [],
}) => {
  const chartData = useMemo(() => {
    if (!expenses || expenses.length === 0) return [];

    const monthMap: Record<string, { total: number; dateObj: Date; label: string }> = {};

    expenses.forEach((exp) => {
      if (!exp.date) return;
      const d = new Date(exp.date);
      if (isNaN(d.getTime())) return;

      const yearMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

      if (!monthMap[yearMonthKey]) {
        monthMap[yearMonthKey] = {
          total: 0,
          dateObj: new Date(d.getFullYear(), d.getMonth(), 1),
          label,
        };
      }
      monthMap[yearMonthKey].total += Number(exp.amount) || 0;
    });

    return Object.entries(monthMap)
      .sort((a, b) => a[1].dateObj.getTime() - b[1].dateObj.getTime())
      .map(([_, val]) => ({
        month: val.label,
        amount: Math.round(val.total),
      }));
  }, [expenses]);

  return (
    <ChartCard
      title="Monthly Operational Expense Trend"
      subtitle="Monthly expenditure timeline across labor, fuel, materials & site fees"
      isEmpty={chartData.length === 0}
      emptyMessage="No expense transactions recorded yet."
      height={250}
    >
      <div className="w-full h-[250px] min-w-0">
        <ResponsiveContainer width="100%" height={250} minWidth={0}>
          <AreaChart
            data={chartData}
            margin={{ top: 15, right: 10, left: -10, bottom: 20 }}
          >
            <defs>
              <linearGradient id="expenseTrendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 10, fill: "#525252" }}
              axisLine={{ stroke: "#e5e5e5" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#737373" }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(val) => {
                if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
                return `₹${val}`;
              }}
            />
            <Tooltip
              content={<CustomTooltip currency={true} titlePrefix="Month" />}
            />
            <Area
              type="monotone"
              dataKey="amount"
              name="Expense"
              stroke="#ef4444"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#expenseTrendGradient)"
              dot={{ r: 3, fill: "#ef4444" }}
              activeDot={{ r: 5 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};

// =========================================================================
// 4. TOP WORKS FINANCIAL COMPARISON (Agreed Amount vs Expenses vs Profit)
// =========================================================================

interface WorkFinancialComparisonChartProps {
  entries: Entry[];
  privateWorks: PrivateWork[];
  expenses: Expense[];
}

export const WorkFinancialComparisonChart: React.FC<WorkFinancialComparisonChartProps> = ({
  entries = [],
  privateWorks = [],
  expenses = [],
}) => {
  const chartData = useMemo(() => {
    const allWorks = [
      ...entries.map((e) => ({
        id: e.id,
        name: e.workName,
        valuation: e.amount,
        type: "Govt",
      })),
      ...privateWorks.map((p) => ({
        id: p.id,
        name: p.workName,
        valuation: p.approxFinalWorkAmount,
        type: "Private",
      })),
    ];

    const enriched = allWorks.map((work) => {
      const workExp = expenses
        .filter((exp) => exp.workId === work.id)
        .reduce((sum, exp) => sum + exp.amount, 0);

      const profit = work.valuation - workExp;

      const shortName =
        work.name.length > 15 ? `${work.name.substring(0, 13)}…` : work.name;

      return {
        id: work.id,
        fullName: work.name,
        shortName,
        agreedAmount: work.valuation,
        expenses: workExp,
        profit: Math.max(0, profit),
      };
    });

    return enriched
      .sort((a, b) => b.agreedAmount - a.agreedAmount)
      .slice(0, 6);
  }, [entries, privateWorks, expenses]);

  return (
    <ChartCard
      title="Top Projects Financial Comparison"
      subtitle="Agreed contract value vs total logged operational expenses (Top 6 projects)"
      isEmpty={chartData.length === 0}
      emptyMessage="No projects available for comparison."
      height={270}
    >
      <div className="w-full h-[270px] min-w-0">
        <ResponsiveContainer width="100%" height={270} minWidth={0}>
          <BarChart
            data={chartData}
            margin={{ top: 15, right: 10, left: -10, bottom: 35 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis
              dataKey="shortName"
              tick={{ fontSize: 9, fill: "#525252" }}
              axisLine={{ stroke: "#e5e5e5" }}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#737373" }}
              axisLine={false}
              tickLine={false}
              width={45}
              tickFormatter={(val) => {
                if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
                if (val >= 100000) return `₹${(val / 100000).toFixed(0)}L`;
                if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
                return `₹${val}`;
              }}
            />
            <Tooltip
              content={<CustomTooltip currency={true} titlePrefix="Project" />}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="circle"
              wrapperStyle={{ fontSize: "10px", paddingBottom: "6px" }}
            />
            <Bar
              dataKey="agreedAmount"
              name="Agreed"
              fill="#171717"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="expenses"
              name="Expense"
              fill="#ef4444"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="profit"
              name="Profit"
              fill="#059669"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
};
