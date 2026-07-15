"use client";

import React, { useState, useCallback, useEffect } from "react";
import type { AppState, Transaction, WorkbookMeta, ParsedBudget, SectionBalance } from "./types";
import { readWorkbook, parseTransactionSheet, detectMapping, mapRows, isMultiSectionFormat, parseMultiSectionSheet } from "./lib/parseExcel";
import { isBudgetSheet, parseBudgetSheet } from "./lib/parseBudget";
import { buildBudgetFromNominalTransactions, normalizeBudgetSubsections, parseNominalActivityPdf } from "./lib/nominalActivity";
import FileUpload from "./components/FileUpload";
import SheetPicker from "./components/SheetPicker";
import Dashboard from "./components/Dashboard";
import BudgetView from "./components/BudgetView";

const SAVED_BUDGET_KEY = "cm-budget.saved-budget";

export default function Home() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");

  // Workbook (held in memory so any sheet can be re-parsed)
  const [workbook, setWorkbook] = useState<WorkbookMeta | null>(null);

  // Transaction flow
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [sectionBalances, setSectionBalances] = useState<SectionBalance[]>([]);

  // Budget flow
  const [budgetData, setBudgetData] = useState<ParsedBudget | null>(null);
  const [savedBudget, setSavedBudget] = useState<ParsedBudget | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_BUDGET_KEY);
      if (raw) {
        setSavedBudget(normalizeBudgetSubsections(JSON.parse(raw) as ParsedBudget));
      }
    } catch {
      window.localStorage.removeItem(SAVED_BUDGET_KEY);
    }
  }, []);

  const persistBudget = useCallback((budget: ParsedBudget) => {
    const normalizedBudget = normalizeBudgetSubsections(budget);
    setBudgetData(normalizedBudget);
    setSavedBudget(normalizedBudget);
    window.localStorage.setItem(SAVED_BUDGET_KEY, JSON.stringify(normalizedBudget));
  }, []);

  const openSavedBudget = useCallback(() => {
    if (!savedBudget) return;
    setError(null);
    setBudgetData(savedBudget);
    setFileName(`Saved Budget · ${savedBudget.sheetName}`);
    setAppState("budget");
  }, [savedBudget]);

  const clearSavedBudget = useCallback(() => {
    window.localStorage.removeItem(SAVED_BUDGET_KEY);
    setSavedBudget(null);
  }, []);

  // ── After a sheet is chosen, decide which flow to use ───────────────────
  const handleSheetSelected = useCallback(
    async (sheetName: string, wb: WorkbookMeta) => {
      setLoading(true);
      setError(null);
      try {
        if (isBudgetSheet(wb.buffer, sheetName)) {
          const parsed = parseBudgetSheet(wb.buffer, sheetName);
          if (parsed && parsed.rows.length > 0) {
            persistBudget(parsed);
            setAppState("budget");
            return;
          }
        }

        // Multi-section bank export format (N/C: / Name: sections)
        if (isMultiSectionFormat(wb.buffer, sheetName)) {
          const { transactions: txns, sectionBalances: balances } = parseMultiSectionSheet(wb.buffer, sheetName);
          setTransactions(txns);
          setSectionBalances(balances);
          persistBudget(buildBudgetFromNominalTransactions(txns, sheetName));
          setAppState("budget");
          return;
        }

        // Fall through to transaction flow
        const { headers, rows } = parseTransactionSheet(wb.buffer, sheetName);
        const detected = detectMapping(headers, rows);

        setHeaders(headers);
        setRows(rows);
        setTransactions(mapRows(rows, detected));
        setAppState("dashboard");
        return;
      } catch (e) {
        setError(e instanceof Error ? e.message : "An unknown error occurred.");
        setAppState("idle");
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // ── File uploaded ────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setFileName(file.name);
    try {
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const parsed = await parseNominalActivityPdf(file);
        persistBudget(parsed);
        setAppState("budget");
        setLoading(false);
        return;
      }

      const wb = await readWorkbook(file);
      setWorkbook(wb);

      if (wb.sheetNames.length === 1) {
        // Skip the picker for single-sheet files
        await handleSheetSelected(wb.sheetNames[0], wb);
      } else {
        setAppState("sheet-pick");
        setLoading(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "An unknown error occurred.");
      setLoading(false);
    }
  }, [handleSheetSelected]);

  // ── Full reset ───────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    setAppState("idle");
    setError(null);
    setFileName("");
    setWorkbook(null);
    setHeaders([]);
    setRows([]);
    setTransactions([]);
    setSectionBalances([]);
    setBudgetData(null);
  }, []);

  const showNewUploadBtn = appState === "dashboard" || appState === "budget";

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Nav */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">💰</span>
            <span className="font-bold text-gray-900 dark:text-white text-lg">CM Budget</span>
          </div>
          <div className="flex items-center gap-4">
            {savedBudget && appState === "idle" && (
              <button
                onClick={openSavedBudget}
                className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Saved Budget
              </button>
            )}
            {showNewUploadBtn && (
              <button
                onClick={handleReset}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              >
                New Upload
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        {/* ── IDLE ──────────────────────────────────────────────────────── */}
        {appState === "idle" && (
          <div className="flex flex-col items-center gap-8">
            <div className="text-center max-w-xl">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                Budget Analyser
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                Upload your financial documents to instantly visualise your finances — income, expenses,
                categories, and trends over time.
              </p>
            </div>

            {/* Privacy notice */}
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
                <p className="text-gray-500 dark:text-gray-400 text-sm">Parsing document…</p>
              </div>
            ) : (
              <FileUpload onFile={handleFile} />
            )}

            {savedBudget && !loading && (
              <div className="w-full max-w-xl rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 dark:border-blue-800 dark:bg-blue-950">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                      Saved Budget
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                      Best place: keep your manual budget here. Open it, edit the figures directly, and this browser will reuse it next time without another upload.
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {savedBudget.sheetName}{savedBudget.year ? ` · ${savedBudget.year}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={openSavedBudget}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      Open Saved Budget
                    </button>
                    <button
                      onClick={clearSavedBudget}
                      className="rounded-lg border border-blue-300 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-white dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="w-full max-w-xl p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Format guide */}
            <div className="w-full max-w-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-6">
              <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-3">
                Supported Spreadsheet Formats
              </h2>
              <div className="space-y-4 text-sm">
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">📊 Budget Report format</p>
                  <div className="flex flex-wrap gap-2">
                    {["Code", "Name", "Budget 2025", "Jan", "Feb", "…", "Dec", "Total"].map((h) => (
                      <span key={h} className="px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-mono">{h}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Rows grouped into INCOME / EXPENDITURE sections. Month columns detected flexibly.</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">💳 Transaction list format</p>
                  <div className="flex flex-wrap gap-2">
                    {["Date", "Description", "Category", "Account", "Debit", "Credit"].map((h) => (
                      <span key={h} className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 text-xs font-mono">{h}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Date as DD/MM/YYYY. Accounting negatives (7,035) supported. Junk rows filtered automatically.</p>
                </div>
                <div>
                  <p className="font-medium text-gray-700 dark:text-gray-200 mb-1">🏦 Multi-section bank export format</p>
                  <div className="flex flex-wrap gap-2">
                    {["N/C:", "Name:", "No", "Date", "Details", "Debit", "Credit", "History Balance:"].map((h) => (
                      <span key={h} className="px-2 py-0.5 rounded bg-teal-100 dark:bg-teal-900 text-teal-700 dark:text-teal-300 text-xs font-mono">{h}</span>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Repeated sections each starting with N/C: and Name: metadata rows. Categories and history balances extracted automatically per section.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SHEET PICKER ──────────────────────────────────────────────── */}
        {appState === "sheet-pick" && workbook && (
          <div className="flex flex-col items-center gap-6">
            {loading ? (
              <div className="flex flex-col items-center gap-4 py-12">
                <svg className="w-10 h-10 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <p className="text-gray-500 dark:text-gray-400 text-sm">Parsing sheet…</p>
              </div>
            ) : (
              <SheetPicker
                fileName={fileName}
                sheetNames={workbook.sheetNames}
                onSelect={(name) => handleSheetSelected(name, workbook)}
                onBack={handleReset}
              />
            )}
            {error && (
              <div className="w-full max-w-md p-4 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                {error}
              </div>
            )}
          </div>
        )}

        {/* ── TRANSACTION DASHBOARD ─────────────────────────────────────── */}
        {appState === "dashboard" && (
          <Dashboard transactions={transactions} sectionBalances={sectionBalances} fileName={fileName} onReset={handleReset} />
        )}

        {/* ── BUDGET REPORT ─────────────────────────────────────────────── */}
        {appState === "budget" && budgetData && (
          <BudgetView budget={budgetData} fileName={fileName} onReset={handleReset} onBudgetChange={persistBudget} />
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

