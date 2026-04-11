import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ResponsiveContainer,
} from "recharts";
import type { Transaction } from "../types";

const COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#6366f1",
];

interface AccountChartProps {
  transactions: Transaction[];
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function AccountChart({ transactions }: AccountChartProps) {
  const accountMap = new Map<string, { income: number; expenses: number }>();

  for (const t of transactions) {
    const acc = t.account || "Unknown";
    const entry = accountMap.get(acc) ?? { income: 0, expenses: 0 };
    if (t.amount > 0) {
      entry.income += t.amount;
    } else {
      entry.expenses += Math.abs(t.amount);
    }
    accountMap.set(acc, entry);
  }

  const data = Array.from(accountMap.entries())
    .map(([account, { income, expenses }]) => ({
      account,
      income: parseFloat(income.toFixed(2)),
      expenses: parseFloat(expenses.toFixed(2)),
      net: parseFloat((income - expenses).toFixed(2)),
    }))
    .sort((a, b) => b.expenses - a.expenses);

  if (data.length === 0 || (data.length === 1 && data[0].account === "Unknown")) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
        No account data available.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis dataKey="account" tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Account</th>
              <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Income</th>
              <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Expenses</th>
              <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Net</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">{row.account}</td>
                <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">{formatCurrency(row.income)}</td>
                <td className="py-2 px-3 text-right text-red-600 dark:text-red-400">{formatCurrency(row.expenses)}</td>
                <td className={`py-2 px-3 text-right font-medium ${row.net >= 0 ? "text-blue-600 dark:text-blue-400" : "text-orange-600 dark:text-orange-400"}`}>
                  {formatCurrency(row.net)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

