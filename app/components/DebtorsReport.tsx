"use client";

import React from "react";
import type { DebtorsReportData } from "../types";

interface DebtorsReportProps {
  data: DebtorsReportData;
  onEditItemAmount?: (index: number) => void;
  onEditTotal?: () => void;
  figureOverrides?: Record<string, number>;
  onEditFigure?: (key: string, label: string, value: number) => void;
}

export default function DebtorsReport({
  data,
  onEditItemAmount,
  onEditTotal,
  figureOverrides,
  onEditFigure,
}: DebtorsReportProps) {
  const indexedItems = data.items.map((item, index) => ({
    ...item,
    sourceIndex: index,
  }));

  const getFigure = (key: string, fallback: number) => figureOverrides?.[key] ?? fallback;

  const renderEditableFigure = (
    key: string,
    label: string,
    fallback: number,
    display: string,
    layout: "between" | "end" = "end"
  ) => {
    if (!onEditFigure) {
      return <span>{display}</span>;
    }

    return (
      <div className={`flex items-center gap-2 ${layout === "between" ? "justify-between" : "justify-end"}`}>
        <span>{display}</span>
        <button
          type="button"
          onClick={() => onEditFigure(key, label, getFigure(key, fallback))}
          className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300"
        >
          Edit
        </button>
      </div>
    );
  };

  const outstandingItems = indexedItems.filter((d) => d.status === "Outstanding");
  const settledItems = indexedItems.filter((d) => d.status !== "Outstanding");
  const outstandingTotal = outstandingItems.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-8 print:p-0 print:border-0 print:bg-white">
      <div className="mb-8 pb-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          DEBTORS REPORT
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Generated on {new Date().toLocaleDateString()}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8 print:grid-cols-3">
        <div className="bg-orange-50 dark:bg-orange-900/20 p-4 rounded-lg border border-orange-200 dark:border-orange-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Outstanding Balance</p>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
            {renderEditableFigure("debtors.outstandingTotal", "Outstanding Balance", outstandingTotal, `£${getFigure("debtors.outstandingTotal", outstandingTotal).toFixed(2)}`, "between")}
          </div>
        </div>
        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-lg border border-red-200 dark:border-red-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Outstanding Invoices</p>
          <div className="text-2xl font-bold text-red-600 dark:text-red-400">
            {renderEditableFigure("debtors.outstandingCount", "Outstanding Invoices", outstandingItems.length, String(getFigure("debtors.outstandingCount", outstandingItems.length)), "between")}
          </div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg border border-green-200 dark:border-green-800">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Debtors</p>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">
            {renderEditableFigure("debtors.totalCount", "Total Debtors", data.items.length, String(getFigure("debtors.totalCount", data.items.length)), "between")}
          </div>
        </div>
      </div>

      <div className="mb-12">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Outstanding Invoices ({getFigure("debtors.outstandingCount", outstandingItems.length)})
        </h2>
        {outstandingItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-gray-300 dark:border-gray-700">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Debtor Name
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Reference
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Invoice Date
                  </th>
                  <th className="text-right py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Amount
                  </th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 dark:text-gray-300">
                    Notes
                  </th>
                </tr>
              </thead>
              <tbody>
                {outstandingItems.map((item, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                  >
                    <td className="py-3 px-4 text-gray-900 dark:text-white font-medium">
                      {item.name}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400 font-mono text-sm">
                      {item.reference}
                    </td>
                    <td className="py-3 px-4 text-gray-600 dark:text-gray-400">
                      {item.date}
                    </td>
                    <td className="py-3 px-4 text-right font-semibold text-gray-900 dark:text-white">
                      <div className="flex items-center justify-end gap-2">
                        <span>£{item.amount.toFixed(2)}</span>
                        {onEditItemAmount && (
                          <button
                            type="button"
                            onClick={() => onEditItemAmount(item.sourceIndex)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-500 dark:text-gray-500 text-sm">
                      {item.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <td colSpan={3} className="py-3 px-4 font-bold text-gray-900 dark:text-white">
                    TOTAL OUTSTANDING
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-gray-900 dark:text-white">
                    {renderEditableFigure("debtors.outstandingTotal", "Outstanding Balance", outstandingTotal, `£${getFigure("debtors.outstandingTotal", outstandingTotal).toFixed(2)}`)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <div className="p-6 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-center">
            <p className="text-green-700 dark:text-green-400 font-medium">
              ✓ No outstanding invoices
            </p>
          </div>
        )}
      </div>

      {settledItems.length > 0 && (
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Settled Invoices ({settledItems.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-800">
                  <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                    Debtor Name
                  </th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                    Reference
                  </th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                    Date
                  </th>
                  <th className="text-right py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                    Amount
                  </th>
                  <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {settledItems.map((item, idx) => (
                  <tr
                    key={idx}
                    className="border-b border-gray-200 dark:border-gray-700"
                  >
                    <td className="py-2 px-3 text-gray-900 dark:text-white">
                      {item.name}
                    </td>
                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400 font-mono text-xs">
                      {item.reference}
                    </td>
                    <td className="py-2 px-3 text-gray-600 dark:text-gray-400">
                      {item.date}
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-gray-900 dark:text-white">
                      <div className="flex items-center justify-end gap-2">
                        <span>£{item.amount.toFixed(2)}</span>
                        {onEditItemAmount && (
                          <button
                            type="button"
                            onClick={() => onEditItemAmount(item.sourceIndex)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 dark:border-gray-600 dark:text-gray-300"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-400">
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="mb-12">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Aging Analysis
        </h2>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Current (0-30 days)", days: [0, 30] },
            { label: "30-60 days", days: [30, 60] },
            { label: "60-90 days", days: [60, 90] },
            { label: "90+ days", days: [90, Infinity] },
          ].map((range, idx) => {
            const now = new Date();
            const count = outstandingItems.filter((item) => {
              const itemDate = new Date(item.date);
              const daysOld = Math.floor(
                (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24)
              );
              return daysOld >= range.days[0] && daysOld < range.days[1];
            }).length;
            const total = outstandingItems
              .filter((item) => {
                const itemDate = new Date(item.date);
                const daysOld = Math.floor(
                  (now.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24)
                );
                return daysOld >= range.days[0] && daysOld < range.days[1];
              })
              .reduce((sum, item) => sum + item.amount, 0);

            return (
              <div
                key={idx}
                className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg"
              >
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                  {range.label}
                </p>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {renderEditableFigure(`debtors.aging.${idx}.count`, `${range.label} Count`, count, String(getFigure(`debtors.aging.${idx}.count`, count)), "between")}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {renderEditableFigure(`debtors.aging.${idx}.amount`, `${range.label} Amount`, total, `£${getFigure(`debtors.aging.${idx}.amount`, total).toFixed(2)}`, "between")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-12 pt-6 border-t border-gray-200 dark:border-gray-700 text-center text-xs text-gray-500 dark:text-gray-400">
        <p>This report was automatically generated. Please verify accuracy with source documents.</p>
      </div>
    </div>
  );
}
