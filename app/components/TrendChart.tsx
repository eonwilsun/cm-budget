"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import type { Transaction } from "../types";

interface TrendChartProps {
  transactions: Transaction[];
}

function parseYearMonth(dateStr: string): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) {
    // Try to parse common formats like "MM/DD/YYYY" or "DD/MM/YYYY"
    const parts = dateStr.split(/[\/\-\.]/);
    if (parts.length >= 3) {
      const year = parts.find((p) => p.length === 4);
      if (year) {
        const monthIdx = parts.indexOf(year) === 0 ? 1 : 0;
        const month = parts[monthIdx].padStart(2, "0");
        return `${year}-${month}`;
      }
    }
    return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function formatLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleString("default", { month: "short", year: "2-digit" });
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function TrendChart({ transactions }: TrendChartProps) {
  const monthMap = new Map<string, { income: number; expenses: number }>();

  for (const t of transactions) {
    const ym = parseYearMonth(t.date);
    if (!ym) continue;
    const entry = monthMap.get(ym) ?? { income: 0, expenses: 0 };
    if (t.amount > 0) {
      entry.income += t.amount;
    } else {
      entry.expenses += Math.abs(t.amount);
    }
    monthMap.set(ym, entry);
  }

  const data = Array.from(monthMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([ym, { income, expenses }]) => ({
      month: formatLabel(ym),
      income: parseFloat(income.toFixed(2)),
      expenses: parseFloat(expenses.toFixed(2)),
      net: parseFloat((income - expenses).toFixed(2)),
    }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
        No monthly data available. Ensure dates are in a recognized format.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="month" tick={{ fontSize: 12 }} />
        <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
        <Tooltip formatter={(value: number) => formatCurrency(value)} />
        <Legend />
        <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Income" />
        <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} name="Expenses" />
        <Line type="monotone" dataKey="net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="4 2" name="Net" />
      </LineChart>
    </ResponsiveContainer>
  );
}
