"use client";

import React, { useState } from "react";
import type { ColumnMapping } from "../types";

interface ColumnMapperProps {
  headers: string[];
  initialMapping: Partial<ColumnMapping>;
  onConfirm: (mapping: ColumnMapping) => void;
  onBack: () => void;
}

const REQUIRED_FIELDS: { key: keyof ColumnMapping; label: string; description: string }[] = [
  { key: "date", label: "Date", description: "Transaction date" },
  { key: "description", label: "Description", description: "Transaction name or memo" },
  { key: "category", label: "Category", description: "Budget category" },
  { key: "account", label: "Account", description: "Bank account or card" },
  { key: "amount", label: "Amount", description: "Transaction amount (positive = income, negative = expense)" },
];

export default function ColumnMapper({ headers, initialMapping, onConfirm, onBack }: ColumnMapperProps) {
  const [mapping, setMapping] = useState<Partial<ColumnMapping>>(initialMapping);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (key: keyof ColumnMapping, value: string) => {
    setMapping((prev) => ({ ...prev, [key]: value }));
  };

  const handleConfirm = () => {
    const missing = REQUIRED_FIELDS.filter((f) => !mapping[f.key]).map((f) => f.label);
    if (missing.length > 0) {
      setError(`Please map the following required fields: ${missing.join(", ")}`);
      return;
    }
    setError(null);
    onConfirm(mapping as ColumnMapping);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-2">
          Map Your Columns
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          We detected the columns below. Please confirm or correct the mapping from your spreadsheet headers.
        </p>

        <div className="space-y-4">
          {REQUIRED_FIELDS.map(({ key, label, description }) => (
            <div key={key} className="grid grid-cols-2 gap-4 items-center">
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-200 text-sm">{label}</p>
                <p className="text-xs text-gray-400">{description}</p>
              </div>
              <select
                value={mapping[key] ?? ""}
                onChange={(e) => handleChange(key, e.target.value)}
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

        {error && (
          <div className="mt-4 p-3 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3 mt-8">
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
