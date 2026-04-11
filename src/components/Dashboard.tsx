import { useState } from "react";
import type { Transaction } from "../types";
import SummaryCards from "./SummaryCards";
import CategoryChart from "./CategoryChart";
import TrendChart from "./TrendChart";
import AccountChart from "./AccountChart";

interface DashboardProps {
  transactions: Transaction[];
  fileName: string;
  onReset: () => void;
}

interface TabConfig {
  id: string;
  label: string;
  icon: string;
}

const TABS: TabConfig[] = [
  { id: "overview", label: "Overview", icon: "📊" },
  { id: "categories", label: "Categories", icon: "🏷️" },
  { id: "trend", label: "Monthly Trend", icon: "📈" },
  { id: "accounts", label: "Accounts", icon: "🏦" },
  { id: "transactions", label: "Transactions", icon: "📋" },
];

function formatCurrency(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function Dashboard({ transactions, fileName, onReset }: DashboardProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 20;

  const filteredTx = transactions.filter(
    (t) =>
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.account.toLowerCase().includes(search.toLowerCase())
  );

  const pagedTx = filteredTx.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(filteredTx.length / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Budget Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {fileName} · {transactions.length} transactions
          </p>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
          Upload New File
        </button>
      </div>

      {/* Summary cards always visible */}
      <SummaryCards transactions={transactions} />

      {/* Tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300"
              }`}
            >
              <span>{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6">
        {activeTab === "overview" && (
          <div className="space-y-8">
            <div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
                Monthly Income vs Expenses
              </h3>
              <TrendChart transactions={transactions} />
            </div>
            <div>
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
                Spending by Category
              </h3>
              <CategoryChart transactions={transactions} />
            </div>
          </div>
        )}

        {activeTab === "categories" && (
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Category Breakdown
            </h3>
            <CategoryChart transactions={transactions} />
          </div>
        )}

        {activeTab === "trend" && (
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Monthly Trend
            </h3>
            <TrendChart transactions={transactions} />
          </div>
        )}

        {activeTab === "accounts" && (
          <div>
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100 mb-4">
              Account Breakdown
            </h3>
            <AccountChart transactions={transactions} />
          </div>
        )}

        {activeTab === "transactions" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search transactions..."
                className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-500 dark:text-gray-400 self-center whitespace-nowrap">
                {filteredTx.length} results
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Date</th>
                    <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Description</th>
                    <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Category</th>
                    <th className="text-left py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Account</th>
                    <th className="text-right py-2 px-3 text-gray-500 dark:text-gray-400 font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTx.map((t, i) => (
                    <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="py-2 px-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{t.date}</td>
                      <td className="py-2 px-3 text-gray-800 dark:text-gray-200 max-w-xs truncate">{t.description}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                          {t.category}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{t.account}</td>
                      <td className={`py-2 px-3 text-right font-medium whitespace-nowrap ${
                        t.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                      }`}>
                        {formatCurrency(t.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm">
                <button
                  disabled={page === 0}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-gray-500 dark:text-gray-400">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

