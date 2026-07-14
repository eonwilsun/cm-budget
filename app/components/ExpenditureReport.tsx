"use client";

import React from "react";
import type { ExpenditureReportData } from "../types";

interface ExpenditureReportProps {
  data: ExpenditureReportData;
}

export default function ExpenditureReport({ data }: ExpenditureReportProps) {
  const groupedByCategory = data.items.reduce(
    (acc, item) => {
      if (!acc[item.category]) {
        acc[item.category] = [];
      }
      acc[item.category].push(item);
      return acc;
    },
    {} as Record<string, typeof data.items>
  );

  const categoryTotals = Object.entries(groupedByCategory).map(([category, items]) => ({
    category,
    total: items.reduce((sum, item) => sum + item.amount, 0),
    items,
  }));

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-8 print:p-0 print:border-0 print:bg-white">
      {/* Header */}
      <div className="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          EXPENDITURE REPORT
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Generated on {new Date().toLocaleDateString()}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8 print:grid-cols-3">
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Expenditure</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">
            £{data.total.toFixed(2)}
          </p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Categories</p>
          <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {data.categories.length}
          </p>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Transactions</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400">
            {data.items.length}
          </p>
        </div>
      </div>

      {/* Category Summary Table */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Summary by Category
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b-2 border-gray-300 dark:border-gray-700">
                <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  Category
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  Count
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  Amount
                </th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                  % of Total
                </th>
              </tr>
            </thead>
            <tbody>
              {categoryTotals.map((cat) => (
                <tr
                  key={cat.category}
                  className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                >
                  <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">
                    {cat.category}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {cat.items.length}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-900 dark:text-white font-semibold">
                    £{cat.total.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600 dark:text-gray-400">
                    {((cat.total / data.total) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">
                  TOTAL
                </td>
                <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">
                  {data.items.length}
                </td>
                <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">
                  £{data.total.toFixed(2)}
                </td>
                <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">
                  100%
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Detailed Transactions by Category */}
      <div className="space-y-8">
        {categoryTotals.map((cat) => (
          <div key={cat.category} className="page-break-inside-avoid">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 pb-2 border-b border-gray-300 dark:border-gray-700">
              {cat.category} - £{cat.total.toFixed(2)}
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800">
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                      Date
                    </th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                      Description
                    </th>
                    <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                      Account
                    </th>
                    <th className="text-right py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {cat.items.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                        {item.date}
                      </td>
                      <td className="py-2 px-3 text-gray-900 dark:text-white">
                        {item.description}
                      </td>
                      <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                        {item.account}
                      </td>
                      <td className="py-2 px-3 text-right font-semibold text-gray-900 dark:text-white">
                        £{item.amount.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-300 dark:border-gray-700">
                    <td colSpan={3} className="py-2 px-3 font-semibold text-gray-900 dark:text-white">
                      Subtotal
                    </td>
                    <td className="py-2 px-3 text-right font-bold text-gray-900 dark:text-white">
                      £{cat.total.toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-center text-xs text-gray-500 dark:text-gray-400">
        <p>This report was automatically generated. Please verify accuracy with source documents.</p>
      </div>
    </div>
  );
}
