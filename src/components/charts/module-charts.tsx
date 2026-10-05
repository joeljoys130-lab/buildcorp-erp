"use client";

import React, { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
  AreaChart, Area
} from "recharts";
import { ChartCard } from "./chart-card";
import { CustomTooltip, formatINR } from "./custom-tooltip";
import { CementLoad, TarLoad, StockRegisterItem, Expense } from "@/lib/types";

// =========================================================================
// 1. PROFIT BREAKDOWN CHART (Cost vs Revenue vs Net Margin)
// =========================================================================

interface ProfitBreakdownChartProps {
  agreedAmountWithGST: number;
  materialsCost: number;
  executionExpense: number;
  totalExpenseWithGST: number;
  overallProfit: number;
  profitPercentage: number;
  workName?: string;
  gstAmount?: number;
}

export const ProfitBreakdownChart: React.FC<ProfitBreakdownChartProps> = ({
  agreedAmountWithGST,
  materialsCost,
  executionExpense,
  totalExpenseWithGST,
  overallProfit,
  profitPercentage,
  workName = "",
}) => {
  const comparisonData = useMemo(() => {
    return [
      {
        name: "Revenue (GST Inc.)",
        value: agreedAmountWithGST,
        fill: "#171717",
      },
      {
        name: "Total Expense (GST Inc.)",
        value: totalExpenseWithGST,
        fill: "#ef4444",
      },
      {
        name: "Net Profit",
        value: Math.max(0, overallProfit),
        fill: overallProfit >= 0 ? "#059669" : "#dc2626",
      },
    ];
  }, [agreedAmountWithGST, totalExpenseWithGST, overallProfit]);

  const costBreakdownData = useMemo(() => {
    return [
      {
        name: "Materials Cost",
        value: materialsCost,
        fill: "#2563eb", // Blue
      },
      {
        name: "Execution Expense",
        value: executionExpense,
        fill: "#f59e0b", // Amber
      },
      {
        name: "Net Retained Profit",
        value: Math.max(0, overallProfit),
        fill: "#059669", // Emerald
      },
    ].filter((item) => item.value > 0);
  }, [materialsCost, executionExpense, overallProfit]);

  const isEmpty = agreedAmountWithGST === 0 && totalExpenseWithGST === 0;

  return (
    <div className="space-y-4">
      {/* Margin Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="border border-neutral-200 bg-white p-3.5 rounded">
          <div className="text-[9px] uppercase font-bold text-neutral-400">Total Revenue</div>
          <div className="text-base font-mono font-bold text-black mt-1">
            ₹{formatINR(agreedAmountWithGST)}
          </div>
        </div>
        <div className="border border-neutral-200 bg-white p-3.5 rounded">
          <div className="text-[9px] uppercase font-bold text-neutral-400">Total Outlay</div>
          <div className="text-base font-mono font-bold text-red-600 mt-1">
            ₹{formatINR(totalExpenseWithGST)}
          </div>
        </div>
        <div className="border border-neutral-200 bg-white p-3.5 rounded">
          <div className="text-[9px] uppercase font-bold text-neutral-400">Profit Margin</div>
          <div className={`text-base font-mono font-bold mt-1 ${profitPercentage >= 0 ? "text-emerald-700" : "text-red-600"}`}>
            {profitPercentage.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Cost vs Revenue Comparison */}
        <ChartCard
          title="Revenue vs Outlay Comparison"
          subtitle="Agreed contract billing vs total project execution outlays"
          isEmpty={isEmpty}
          height={220}
          printHidden={false}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={comparisonData}
              layout="vertical"
              margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
              <XAxis
                type="number"
                tick={{ fontSize: 9, fill: "#737373" }}
                axisLine={{ stroke: "#e5e5e5" }}
                tickFormatter={(val) => {
                  if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
                  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
                  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
                  return `₹${val}`;
                }}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 9, fill: "#525252" }}
                axisLine={false}
                tickLine={false}
                width={120}
              />
              <Tooltip content={<CustomTooltip currency={true} />} />
              <Bar dataKey="value" name="Amount" radius={[0, 4, 4, 0]}>
                {comparisonData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Budget Allocation Breakdown Donut */}
        <ChartCard
          title="Budget Allocation Breakdown"
          subtitle="Materials cost, execution expenses & net retained profit"
          isEmpty={costBreakdownData.length === 0}
          height={220}
          printHidden={false}
        >
          <div className="w-full h-full flex items-center justify-between gap-2">
            <div className="w-1/2 h-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<CustomTooltip currency={true} titlePrefix="Category" />} />
                  <Pie
                    data={costBreakdownData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={65}
                    paddingAngle={3}
                  >
                    {costBreakdownData.map((entry, index) => (
                      <Cell key={`donut-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 space-y-1.5 text-xs pr-1">
              {costBreakdownData.map((item) => {
                const total = costBreakdownData.reduce((s, i) => s + i.value, 0);
                const pct = total > 0 ? ((item.value / total) * 100).toFixed(0) : "0";
                return (
                  <div key={item.name} className="py-1 border-b border-neutral-100 flex flex-col">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                      <span className="text-[10px] font-medium text-neutral-600 truncate">{item.name}</span>
                    </div>
                    <div className="flex justify-between items-center pl-3.5 mt-0.5">
                      <span className="font-mono font-bold text-[10px] text-black">₹{formatINR(item.value)}</span>
                      <span className="font-mono text-[9px] text-neutral-400">{pct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ChartCard>
      </div>
    </div>
  );
};

// =========================================================================
// 2. EXPENSE CATEGORY DISTRIBUTION (Expense Updation)
// =========================================================================

interface ExpenseCategoryChartProps {
  expenses: Expense[];
  workName?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Labour: "#171717",
  Food: "#0284c7",
  "Machine Rent": "#7c3aed",
  Water: "#06b6d4",
  Petrol: "#ea580c",
  Diesel: "#b45309",
  "Site Fee": "#059669",
  Others: "#6b7280",
};

export const ExpenseCategoryChart: React.FC<ExpenseCategoryChartProps> = ({
  expenses = [],
  workName = "",
}) => {
  const categoryData = useMemo(() => {
    if (!expenses || expenses.length === 0) return [];

    const catMap: Record<string, number> = {};
    expenses.forEach((exp) => {
      const desc = exp.description || "Others";
      catMap[desc] = (catMap[desc] || 0) + Number(exp.amount || 0);
    });

    return Object.entries(catMap)
      .map(([name, amount]) => ({
        name,
        amount: Math.round(amount),
        fill: CATEGORY_COLORS[name] || "#64748b",
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [expenses]);

  const totalExpense = useMemo(
    () => categoryData.reduce((sum, item) => sum + item.amount, 0),
    [categoryData]
  );

  return (
    <ChartCard
      title="Expense Distribution by Category"
      subtitle={
        workName
          ? `Cost breakdown by category for ${workName} (₹${formatINR(totalExpense)})`
          : `All logged expenses by category (₹${formatINR(totalExpense)})`
      }
      isEmpty={categoryData.length === 0}
      emptyMessage="No expenses recorded for this project yet."
      height={260}
    >
      <div className="w-full h-full flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Donut Chart */}
        <div className="w-full sm:w-1/2 h-[190px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomTooltip currency={true} titlePrefix="Category" />} />
              <Pie
                data={categoryData}
                dataKey="amount"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={46}
                outerRadius={75}
                paddingAngle={3}
              >
                {categoryData.map((entry, index) => (
                  <Cell key={`cat-${index}`} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono text-xs font-bold text-black">
              {categoryData.length}
            </span>
            <span className="text-[9px] uppercase font-bold text-neutral-400">Categories</span>
          </div>
        </div>

        {/* Category Breakdown Table */}
        <div className="w-full sm:w-1/2 space-y-1 overflow-y-auto max-h-[190px] pr-2">
          {categoryData.map((item) => {
            const pct = totalExpense > 0 ? ((item.amount / totalExpense) * 100).toFixed(1) : "0";
            return (
              <div
                key={item.name}
                className="flex items-center justify-between py-1 border-b border-neutral-100 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                  <span className="font-medium text-neutral-700 text-[11px] truncate max-w-[110px]">
                    {item.name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-black text-[11px]">
                    ₹{formatINR(item.amount)}
                  </span>
                  <span className="text-[10px] text-neutral-400 font-mono w-10 text-right">
                    {pct}%
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
// 3. STOCK INVENTORY CHART (Stock Register)
// =========================================================================

interface StockInventoryChartProps {
  stockItems: StockRegisterItem[];
}

export const StockInventoryChart: React.FC<StockInventoryChartProps> = ({
  stockItems = [],
}) => {
  const chartData = useMemo(() => {
    return stockItems.map((item) => {
      const balance = Math.max(0, item.inTonne - item.usedInTonne);
      return {
        material: item.materialName,
        total: Number(item.inTonne.toFixed(2)),
        used: Number(item.usedInTonne.toFixed(2)),
        balance: Number(balance.toFixed(2)),
      };
    });
  }, [stockItems]);

  return (
    <ChartCard
      title="Raw Material Aggregate Inventory & Consumption"
      subtitle="Total stocked vs consumed vs available balance in Tonnes"
      isEmpty={chartData.length === 0}
      emptyMessage="No stock inventory registered."
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 15, right: 15, left: 10, bottom: 25 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="material"
            tick={{ fontSize: 11, fill: "#525252", fontWeight: 600 }}
            axisLine={{ stroke: "#e5e5e5" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 9, fill: "#737373" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => `${val} T`}
          />
          <Tooltip
            content={<CustomTooltip currency={false} unit="Tonnes" titlePrefix="Material" />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
          />
          <Bar dataKey="total" name="Total Inflow" fill="#171717" radius={[3, 3, 0, 0]} />
          <Bar dataKey="used" name="Consumed on Sites" fill="#ef4444" radius={[3, 3, 0, 0]} />
          <Bar dataKey="balance" name="Stock Balance" fill="#059669" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// =========================================================================
// 4. MATERIALS RECONCILIATION (Materials Used in Site)
// =========================================================================

interface MaterialsReconciliationChartProps {
  materialSummary: Array<{
    specName: string;
    estimated: number;
    delivered: number;
    balance: number;
  }>;
  workName?: string;
}

export const MaterialsReconciliationChart: React.FC<MaterialsReconciliationChartProps> = ({
  materialSummary = [],
  workName = "",
}) => {
  const chartData = useMemo(() => {
    return materialSummary.map((item) => ({
      name: item.specName.length > 18 ? `${item.specName.substring(0, 16)}…` : item.specName,
      fullName: item.specName,
      estimated: Math.round(item.estimated * 100) / 100,
      delivered: Math.round(item.delivered * 100) / 100,
      balance: Math.round(item.balance * 100) / 100,
    }));
  }, [materialSummary]);

  return (
    <ChartCard
      title="Estimated vs Delivered Site Materials"
      subtitle={
        workName
          ? `Material dispatch reconciliation for ${workName}`
          : "Material dispatch reconciliation"
      }
      isEmpty={chartData.length === 0}
      emptyMessage="No material line items recorded for this work."
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 15, right: 15, left: 10, bottom: 25 }}>
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
          />
          <Tooltip
            content={<CustomTooltip currency={false} unit="Units" titlePrefix="Specification" />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
          />
          <Bar dataKey="estimated" name="Estimated Quantity" fill="#2563eb" radius={[3, 3, 0, 0]} />
          <Bar dataKey="delivered" name="Delivered to Site" fill="#059669" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// =========================================================================
// 5. CEMENT PROCUREMENT & PAYMENT STATUS (Cement Load Updation)
// =========================================================================

interface CementLoadTrendChartProps {
  cementLoads: CementLoad[];
}

export const CementLoadTrendChart: React.FC<CementLoadTrendChartProps> = ({
  cementLoads = [],
}) => {
  const chartData = useMemo(() => {
    if (!cementLoads || cementLoads.length === 0) return [];

    const monthMap: Record<string, { bags: number; amount: number; paid: number; balance: number; label: string; dateObj: Date }> = {};

    cementLoads.forEach((cl) => {
      if (!cl.purchaseDate) return;
      const d = new Date(cl.purchaseDate);
      if (isNaN(d.getTime())) return;

      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });

      if (!monthMap[key]) {
        monthMap[key] = {
          bags: 0,
          amount: 0,
          paid: 0,
          balance: 0,
          label,
          dateObj: new Date(d.getFullYear(), d.getMonth(), 1),
        };
      }
      monthMap[key].bags += Number(cl.loadInBags || 0);
      monthMap[key].amount += Number(cl.amountPerLoad || 0);
      monthMap[key].paid += Number(cl.paidAmount || 0);
      monthMap[key].balance += Number(cl.balanceAmount || 0);
    });

    return Object.entries(monthMap)
      .sort((a, b) => a[1].dateObj.getTime() - b[1].dateObj.getTime())
      .map(([_, v]) => ({
        month: v.label,
        bags: v.bags,
        paid: Math.round(v.paid),
        balance: Math.round(v.balance),
      }));
  }, [cementLoads]);

  return (
    <ChartCard
      title="Monthly Cement Procurement & Payment Status"
      subtitle="Monthly bags delivered alongside paid amounts and outstanding supplier balance"
      isEmpty={chartData.length === 0}
      emptyMessage="No cement load entries recorded."
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 15, right: 15, left: 10, bottom: 25 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "#525252" }}
            axisLine={{ stroke: "#e5e5e5" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 9, fill: "#737373" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => {
              if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
              if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
              return `₹${val}`;
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 9, fill: "#737373" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => `${val} Bags`}
          />
          <Tooltip content={<CustomTooltip currency={true} titlePrefix="Period" />} />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
          />
          <Bar yAxisId="left" dataKey="paid" name="Paid Amount" fill="#059669" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="left" dataKey="balance" name="Balance Due" fill="#ef4444" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="right" dataKey="bags" name="Bags Purchased" fill="#171717" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// =========================================================================
// 6. TAR / BITUMEN PROCUREMENT TREND (Tar Load Updation)
// =========================================================================

interface TarLoadTrendChartProps {
  tarLoads: TarLoad[];
}

export const TarLoadTrendChart: React.FC<TarLoadTrendChartProps> = ({
  tarLoads = [],
}) => {
  const chartData = useMemo(() => {
    if (!tarLoads || tarLoads.length === 0) return [];

    // Group by item type (RS1, SS1, VG30, etc.)
    const itemMap: Record<string, { qtyKg: number; amount: number; paid: number; balance: number }> = {};

    tarLoads.forEach((tl) => {
      const itemKey = tl.item || "General Bitumen";
      if (!itemMap[itemKey]) {
        itemMap[itemKey] = { qtyKg: 0, amount: 0, paid: 0, balance: 0 };
      }
      itemMap[itemKey].qtyKg += Number(tl.quantityInKg || 0);
      itemMap[itemKey].amount += Number(tl.amountPerLoad || 0);
      itemMap[itemKey].paid += Number(tl.paidAmount || 0);
      itemMap[itemKey].balance += Number(tl.balanceToBePaid || 0);
    });

    return Object.entries(itemMap).map(([item, v]) => ({
      item,
      quantityTons: Number((v.qtyKg / 1000).toFixed(2)),
      paid: Math.round(v.paid),
      balance: Math.round(v.balance),
    }));
  }, [tarLoads]);

  return (
    <ChartCard
      title="Bitumen Aggregate Purchases by Grade"
      subtitle="Purchased quantity (Metric Tons) and payment balance by emulsion grade"
      isEmpty={chartData.length === 0}
      emptyMessage="No tar load records logged."
      height={260}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 15, right: 15, left: 10, bottom: 25 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis
            dataKey="item"
            tick={{ fontSize: 10, fill: "#525252", fontWeight: 600 }}
            axisLine={{ stroke: "#e5e5e5" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 9, fill: "#737373" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => {
              if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
              if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
              return `₹${val}`;
            }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 9, fill: "#737373" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(val) => `${val} T`}
          />
          <Tooltip content={<CustomTooltip currency={true} titlePrefix="Grade" />} />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            wrapperStyle={{ fontSize: "11px", paddingBottom: "8px" }}
          />
          <Bar yAxisId="left" dataKey="paid" name="Paid Amount" fill="#059669" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="left" dataKey="balance" name="Balance Due" fill="#ef4444" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="right" dataKey="quantityTons" name="Weight (Tons)" fill="#171717" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// =========================================================================
// 7. BOQ ESTIMATE ITEM DISTRIBUTION (Work Based Entry)
// =========================================================================

interface BoqDistributionChartProps {
  boqItems: Array<{
    itemName: string;
    totalAmountPerItem: number;
    itemQuantity?: number;
    itemUnit?: string;
  }>;
  workName?: string;
}

export const BoqDistributionChart: React.FC<BoqDistributionChartProps> = ({
  boqItems = [],
  workName = "",
}) => {
  const chartData = useMemo(() => {
    return boqItems
      .map((item) => ({
        name: item.itemName.length > 20 ? `${item.itemName.substring(0, 18)}…` : item.itemName,
        fullName: item.itemName,
        amount: Math.round(item.totalAmountPerItem),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8); // Top 8 items
  }, [boqItems]);

  const totalValue = useMemo(
    () => boqItems.reduce((sum, item) => sum + item.totalAmountPerItem, 0),
    [boqItems]
  );

  return (
    <ChartCard
      title="BOQ Specification Valuation Breakdown"
      subtitle={
        workName
          ? `Top estimated items for ${workName} (Total ₹${formatINR(totalValue)})`
          : `Top estimated items by value (Total ₹${formatINR(totalValue)})`
      }
      isEmpty={chartData.length === 0}
      emptyMessage="No BOQ line items added yet."
      height={250}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 10, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis
            type="number"
            tick={{ fontSize: 9, fill: "#737373" }}
            axisLine={{ stroke: "#e5e5e5" }}
            tickFormatter={(val) => {
              if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
              if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
              return `₹${val}`;
            }}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fontSize: 9, fill: "#525252" }}
            axisLine={false}
            tickLine={false}
            width={130}
          />
          <Tooltip content={<CustomTooltip currency={true} titlePrefix="BOQ Specification" />} />
          <Bar dataKey="amount" name="Estimated Amount" fill="#171717" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
};

// =========================================================================
// 8. DLP COMPLIANCE DISTRIBUTION (DLP Notifications)
// =========================================================================

interface DlpDistributionChartProps {
  expiredCount: number;
  expiringSoonCount: number;
  activeCount: number;
}

export const DlpDistributionChart: React.FC<DlpDistributionChartProps> = ({
  expiredCount,
  expiringSoonCount,
  activeCount,
}) => {
  const chartData = useMemo(() => {
    return [
      { name: "Period Crossed (Expired)", count: expiredCount, fill: "#dc2626" },
      { name: "Expiring Soon (≤30 Days)", count: expiringSoonCount, fill: "#d97706" },
      { name: "Active (Within DLP)", count: activeCount, fill: "#059669" },
    ].filter((i) => i.count > 0);
  }, [expiredCount, expiringSoonCount, activeCount]);

  const total = expiredCount + expiringSoonCount + activeCount;

  return (
    <ChartCard
      title="DLP Risk & Warranty Status"
      subtitle={`${total} contracts monitored for Defect Liability compliance`}
      isEmpty={chartData.length === 0}
      emptyMessage="No completed contracts currently evaluated for DLP."
      height={220}
    >
      <div className="w-full h-full flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-1/2 h-[160px] relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<CustomTooltip currency={false} unit="Contracts" titlePrefix="DLP Status" />} />
              <Pie
                data={chartData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={38}
                outerRadius={65}
                paddingAngle={4}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`dlp-${index}`} fill={entry.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="font-mono text-base font-bold text-black">{total}</span>
            <span className="text-[8px] uppercase font-bold text-neutral-400">Contracts</span>
          </div>
        </div>
        <div className="w-full sm:w-1/2 space-y-1.5 pr-2">
          {chartData.map((item) => {
            const pct = total > 0 ? ((item.count / total) * 100).toFixed(0) : "0";
            return (
              <div key={item.name} className="flex items-center justify-between py-1 border-b border-neutral-100 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                  <span className="text-[10px] font-medium text-neutral-700">{item.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono font-bold text-[11px] text-black">{item.count}</span>
                  <span className="font-mono text-[9px] text-neutral-400 w-7 text-right">{pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
};
