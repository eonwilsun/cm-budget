"use client";

import React, { useState, useCallback } from "react";
import type { AppState, ColumnMapping, Transaction } from "./types";
import { parseExcelFile, detectMapping, mapRows } from "./lib/parseExcel";
import FileUpload from "./components/FileUpload";
import ColumnMapper from "./components/ColumnMapper";
import Dashboard from "./components/Dashboard";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [initialMapping, setInitialMapping] = useState<Partial<ColumnMapping>>({});
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      const { headers, rows } = await parseExcelFile(file);
      const detected = detectMapping(headers);

      const hasAmount = !!detected.amount;
      const hasDebitCredit = !!(detected.debit && detected.credit);
      const amountReady = hasAmount || hasDebitCredit;
      const allMapped = detected.date && detected.description && amountReady;

      setHeaders(headers);
      setRows(rows);
      setInitialMapping(detected);

      if (allMapped) {
        const txs = mapRows(rows, detected as ColumnMapping);
        setTransactions(txs);
        setAppState("dashboard");
      } else {
        setAppState("mapping");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unknown error occurred.");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleMappingConfirm = useCallback(
    (mapping: ColumnMapping) => {
      const txs = mapRows(rows, mapping);
      setTransactions(txs);
      setAppState("dashboard");
    },
    [rows]
  );

  const handleReset = useCallback(() => {
    setAppState("idle");
    setError(null);
    setFileName("");
    setHeaders([]);
    setRows([]);
    setInitialMapping({});
    setTransactions([]);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Nav */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <span className="font-bold text-gray-900 dark:text-white text-lg">CM Budget</span>
          </div>
          {appState === "dashboard" && (
            <button
              onClick={handleReset}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              New Upload
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {appState === "idle" && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center max-w-xl">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                Budget Analyser
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Upload your Excel spreadsheet to instantly visualise your finances — income, expenses,
                categories, and trends over time.
              </p>
            </div>

            {/* Privacy notice – GDPR */}
            <div className="w-full max-w-xl flex items-start gap-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 rounded-xl px-5 py-4">
              <span className="text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0">🔒</span>
              <div>
                <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
                  Your data never leaves your device
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  All processing happens entirely in your browser. No spreadsheet data is uploaded,
                  stored, or shared with any server. When you close the tab, the data is gone.
                </p>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <svg className="w-10 h-10 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Parsing spreadsheet…</p>
              </div>
            ) : (
              <FileUpload onFile={handleFile} />
            )}

            {error && (
              <div className="w-full max-w-xl p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Format guide – no example personal/financial data */}
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">
                Expected Spreadsheet Format
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Your file should have column headers similar to the ones below. If they differ, you will
                be shown a mapping step to match them up.
              </p>

              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">Option A – Single amount column</p>
                  <div className="flex flex-wrap gap-2">
                    {["Date", "Description", "Category", "Account", "Amount"].map((h) => (
                      <span key={h} className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-mono">
                        {h}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Amount: negative = expense, positive = income</p>
                </div>

                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">Option B – Debit / Credit columns</p>
                  <div className="flex flex-wrap gap-2">
                    {["Date", "Description", "Category", "Account", "Debit", "Credit"].map((h) => (
                      <span key={h} className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs font-mono">
                        {h}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Debit = money out, Credit = money in. Blank cells are treated as 0.</p>
                </div>

                <div className="border-t border-gray-100 dark:border-gray-800 pt-3 text-xs text-gray-400 space-y-1">
                  <p>📅 Dates accepted as <strong className="text-gray-500">DD/MM/YYYY</strong>, YYYY-MM-DD, or Excel serial numbers.</p>
                  <p>🚫 Summary rows (Totals, History Balance, Account Balance, N/C:, Name:) are ignored automatically.</p>
                  <p>✅ Column names are flexible — you can re-map them if they don&apos;t match exactly.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {appState === "mapping" && (
          <div className="flex flex-col items-center gap-6">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Map Your Columns</h1>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{fileName}</p>
            </div>
            <ColumnMapper
              headers={headers}
              initialMapping={initialMapping}
              onConfirm={handleMappingConfirm}
              onBack={handleReset}
            />
          </div>
        )}

        {appState === "dashboard" && (
          <Dashboard
            transactions={transactions}
            fileName={fileName}
            onReset={handleReset}
          />
        )}
      </main>

      <footer className="border-t border-gray-200 dark:border-gray-800 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-gray-400 dark:text-gray-500">
          All data is processed locally in your browser and is never transmitted to any server.
        </div>
      </footer>
    </div>
  );
}

