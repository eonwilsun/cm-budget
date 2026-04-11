"use client";

import React, { useState } from "react";
import type { ColumnMapping } from "../types";

interface ColumnMapperProps {
  headers: string[];
  initialMapping: Partial<ColumnMapping>;
  onConfirm: (mapping: ColumnMapping) => void;
  onBack: () => void;
}

type AmountMode = "single" | "debitcredit";

const BASE_FIELDS: { key: keyof ColumnMapping; label: string; description: string }[] = [
  { key: "date", label: "Date", description: "Transaction date (DD/MM/YYYY supported)" },
  { key: "description", label: "Description", description: "Transaction name or memo" },
  { key: "category", label: "Category", description: "Budget category (optional)" },
  { key: "account", label: "Account", description: "Bank account or card (optional)" },
];

const TRULY_REQUIRED: Array<keyof ColumnMapping> = ["date", "description"];

export default function ColumnMapper({ headers, initialMapping, onConfirm, onBack }: ColumnMapperProps) {
  const hasDebitCredit = !!(initialMapping.debit && initialMapping.credit);
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(initialMapping);
  const [amountMode, setAmountMode] = useState<AmountMode>(hasDebitCredit ? "debitcredit" : "single");
  const [error, setError] = useState<string | null>(null);

  const handleChange = (key: keyof ColumnMapping, value: string) => {
    setMapping((prev) => ({ ...prev, [key]: value }));
  };

  const handleModeChange = (mode: AmountMode) => {
    setAmountMode(mode);
    if (mode === "single") {
      setMapping((prev) => ({ ...prev, debit: "", credit: "" }));
    } else {
      setMapping((prev) => ({ ...prev, amount: "" }));
    }
  };

  const handleConfirm = () => {
    const missing: string[] = [];

    for (const key of TRULY_REQUIRED) {
      if (!mapping[key]) missing.push(key);
    }

    if (amountMode === "single" && !mapping.amount) {
      missing.push("Amount");
    }
    if (amountMode === "debitcredit") {
      if (!mapping.debit) missing.push("Debit");
      if (!mapping.credit) missing.push("Credit");
    }

    if (missing.length > 0) {
      setError(`Please map the following required fields: ${missing.join(", ")}`);
      return;
    }
    setError(null);

    const final: ColumnMapping = {
      date: mapping.date!,
      description: mapping.description!,
      category: mapping.category ?? "",
      account: mapping.account ?? "",
      amount: amountMode === "single" ? (mapping.amount ?? "") : "",
      debit: amountMode === "debitcredit" ? (mapping.debit ?? "") : undefined,
      credit: amountMode === "debitcredit" ? (mapping.credit ?? "") : undefined,
    };
    onConfirm(final);
  };

  const selectClass =
    "border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full";

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">Map Your Columns</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          We detected the columns below. Confirm or correct the mapping so the dashboard reads your data
          correctly.
        </p>

        {/* Base fields */}
        <div className="space-y-4 mb-6">
          {BASE_FIELDS.map(({ key, label, description }) => (
            <div key={key} className="grid grid-cols-2 gap-4 items-center">
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200 text-sm">{label}</p>
                <p className="text-xs text-gray-400">{description}</p>
              </div>
              <select
                value={mapping[key] ?? ""}
                onChange={(e) => handleChange(key, e.target.value)}
                className={selectClass}
              >
                <option value="">-- Select column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        {/* Amount mode toggle */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6 mb-4">
          <p className="font-medium text-gray-700 dark:text-gray-200 text-sm mb-3">Amount columns</p>
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={() => handleModeChange("single")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                amountMode === "single"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
              }`}
            >
              Single Amount column
            </button>
            <button
              type="button"
              onClick={() => handleModeChange("debitcredit")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors border ${
                amountMode === "debitcredit"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
              }`}
            >
              Separate Debit / Credit columns
            </button>
          </div>

          {amountMode === "single" && (
            <div className="grid grid-cols-2 gap-4 items-center">
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200 text-sm">Amount</p>
                <p className="text-xs text-gray-400">Signed value (negative = expense)</p>
              </div>
              <select
                value={mapping.amount ?? ""}
                onChange={(e) => handleChange("amount", e.target.value)}
                className={selectClass}
              >
                <option value="">-- Select column --</option>
                {headers.map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
          )}

          {amountMode === "debitcredit" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200 text-sm">Debit column</p>
                  <p className="text-xs text-gray-400">Money going out (expenses)</p>
                </div>
                <select
                  value={mapping.debit ?? ""}
                  onChange={(e) => handleChange("debit", e.target.value)}
                  className={selectClass}
                >
                  <option value="">-- Select column --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4 items-center">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200 text-sm">Credit column</p>
                  <p className="text-xs text-gray-400">Money coming in (income)</p>
                </div>
                <select
                  value={mapping.credit ?? ""}
                  onChange={(e) => handleChange("credit", e.target.value)}
                  className={selectClass}
                >
                  <option value="">-- Select column --</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-2 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onBack}
            className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            ← Back
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Confirm Mapping →
          </button>
        </div>
      </div>
    </div>
  );
}

