"use client";

import React, { useRef, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import type { ParsedBudget, BudgetRow } from "../types";
import { downloadAsJPEG, downloadAsPNG } from "../lib/exportUtils";

const SECTION_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

interface BudgetDashboardProps {
  budget: ParsedBudget;
}

function fmt(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}

function truncateLabel(label: string, maxLength = 34) {
  if (label.length <= maxLength) return label;
  return `${label.slice(0, maxLength - 1)}…`;
}

function sumValues(rows: BudgetRow[], colKeys: string[]): number {
  return rows.reduce((acc, r) => {
    for (const k of colKeys) acc += r.values[k] ?? 0;
    return acc;
  }, 0);
}

export default function BudgetDashboard({ budget }: BudgetDashboardProps) {
  const [exporting, setExporting] = useState<string | null>(null);
  const monthlyChartRef = useRef<HTMLDivElement>(null);
  const pieChartRef = useRef<HTMLDivElement>(null);
  const barChartRef = useRef<HTMLDivElement>(null);
  const monthCols = budget.columns.filter((c) => c.monthIndex !== null);
  const budgetCol = budget.columns.find((c) => c.isBudget);
  const monthKeys = monthCols.map((c) => c.key);
  const allItems = budget.rows.filter((r) => r.rowType === "item");

  const incomeItems = budget.rows.filter((r) => r.rowType === "item" && r.sectionType === "income");
  const expendItems = budget.rows.filter((r) => r.rowType === "item" && r.sectionType === "expenditure");

  const totalBudgetAll = budgetCol ? sumValues(allItems, [budgetCol.key]) : 0;
  const totalBudgetIncome = budgetCol ? sumValues(incomeItems, [budgetCol.key]) : 0;
  const totalBudgetExpend = budgetCol ? sumValues(expendItems, [budgetCol.key]) : 0;
  const totalActualIncome = sumValues(incomeItems, monthKeys);
  const totalActualExpend = sumValues(expendItems, monthKeys);
  const netBudget = totalBudgetIncome - totalBudgetExpend;
  const netActual = totalActualIncome - totalActualExpend;

  const summaryCards = [
    { label: "Budget 2026",       value: fmt(totalBudgetAll),    color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-950",     border: "border-blue-200 dark:border-blue-800" },
    { label: "Budget Expenditure",value: fmt(totalActualExpend), color: "text-red-600 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-950",       border: "border-red-200 dark:border-red-800" },
    { label: "Budget Net",        value: fmt(netBudget),         color: netBudget >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400", bg: netBudget >= 0 ? "bg-emerald-50 dark:bg-emerald-950" : "bg-orange-50 dark:bg-orange-950", border: netBudget >= 0 ? "border-emerald-200 dark:border-emerald-800" : "border-orange-200 dark:border-orange-800" },
    { label: "Actual Income",     value: fmt(totalActualIncome), color: "text-blue-600 dark:text-blue-400",    bg: "bg-blue-50 dark:bg-blue-950",     border: "border-blue-200 dark:border-blue-800" },
    { label: "Actual Expenditure",value: fmt(totalActualExpend), color: "text-red-600 dark:text-red-400",      bg: "bg-red-50 dark:bg-red-950",       border: "border-red-200 dark:border-red-800" },
    { label: "Actual Net",        value: fmt(netActual),         color: netActual >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-orange-600 dark:text-orange-400", bg: netActual >= 0 ? "bg-emerald-50 dark:bg-emerald-950" : "bg-orange-50 dark:bg-orange-950", border: netActual >= 0 ? "border-emerald-200 dark:border-emerald-800" : "border-orange-200 dark:border-orange-800" },
  ];

  // Income vs Expenditure by month
  const monthlyData = monthCols.map((col) => ({
    month: col.label,
    Income: Math.round(sumValues(incomeItems, [col.key])),
    Expenditure: Math.round(sumValues(expendItems, [col.key])),
  })).filter((d) => d.Income !== 0 || d.Expenditure !== 0);

  // Spend by subsection heading when present, otherwise by item/section label.
  const headingTotals = new Map<string, number>();
  for (const row of expendItems) {
    const heading = row.subsectionName || row.name || row.sectionName;
    const current = headingTotals.get(heading) ?? 0;
    headingTotals.set(heading, current + sumValues([row], monthKeys));
  }

  const sectionData = Array.from(headingTotals.entries())
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  // Top 10 subsection headings by actual spend
  const headingItems = sectionData;
  const barChartHeight = Math.max(420, headingItems.length * 42);

  async function handleExport(action: () => Promise<void>, key: string) {
    setExporting(key);
    try {
      await action();
    } catch (error) {
      console.error("Chart export failed", error);
      window.alert("Chart download failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  function ChartButtons({ baseName, targetRef, pngKey, jpegKey }: {
    baseName: string;
    targetRef: React.RefObject<HTMLDivElement | null>;
    pngKey: string;
    jpegKey: string;
  }) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => handleExport(() => downloadAsPNG(targetRef.current, `${baseName}.png`), pngKey)}
          disabled={exporting === pngKey}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {exporting === pngKey ? "Working..." : "PNG"}
        </button>
        <button
          onClick={() => handleExport(() => downloadAsJPEG(targetRef.current, `${baseName}.jpg`), jpegKey)}
          disabled={exporting === jpegKey}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
        >
          {exporting === jpegKey ? "Working..." : "JPEG"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {summaryCards.map((c) => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.bg} ${c.border}`}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-tight">{c.label}</p>
            <p className={`text-lg font-bold mt-1 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Income vs Expenditure by month */}
      {monthlyData.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Income vs Expenditure by Month</h3>
            <ChartButtons baseName="cm-budget-income-vs-expenditure" targetRef={monthlyChartRef} pngKey="month-png" jpegKey="month-jpeg" />
          </div>
          <div ref={monthlyChartRef}>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(Number(v))} />
                <Legend />
                <Bar dataKey="Income" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Expenditure" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Spend by section */}
        {sectionData.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Spend by Heading</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Hover over a slice to see the heading name and total.
                </p>
              </div>
              <ChartButtons baseName="cm-budget-spend-by-heading" targetRef={pieChartRef} pngKey="pie-png" jpegKey="pie-jpeg" />
            </div>
            <div ref={pieChartRef}>
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={sectionData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} paddingAngle={1}>
                    {sectionData.map((_, i) => (
                      <Cell key={i} fill={SECTION_COLORS[i % SECTION_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, _name, item) => [fmt(Number(v)), item.payload.name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {sectionData.map((item, index) => (
                  <div key={item.name} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span
                      className="h-3 w-3 shrink-0 rounded-sm"
                      style={{ backgroundColor: SECTION_COLORS[index % SECTION_COLORS.length] }}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.name}</span>
                    <span className="shrink-0 font-medium text-gray-500 dark:text-gray-400">{fmt(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Top items */}
        {headingItems.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">All Expenditure Headings (Actual)</h3>
              <ChartButtons baseName="cm-budget-all-expenditure-headings" targetRef={barChartRef} pngKey="bar-png" jpegKey="bar-jpeg" />
            </div>
            <div ref={barChartRef}>
              <ResponsiveContainer width="100%" height={barChartHeight}>
                <BarChart data={headingItems} layout="vertical" margin={{ top: 8, bottom: 8, left: 8, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" tickFormatter={(v) => `£${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={220} tick={{ fontSize: 10 }} interval={0} tickFormatter={(value: string) => truncateLabel(value)} />
                  <Tooltip formatter={(v, _name, item) => [fmt(Number(v)), item.payload.name]} />
                  <Bar dataKey="value" fill="#3b82f6" radius={[0, 3, 3, 0]}>
                    {headingItems.map((_, i) => (
                      <Cell key={i} fill={SECTION_COLORS[i % SECTION_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
