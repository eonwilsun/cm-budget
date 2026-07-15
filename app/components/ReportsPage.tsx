"use client";

import React, { useState, useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { ReportData, ExpenditureItem, DebtorItem, CashAtBankItem } from "../types";
import ExpenditureReport from "./ExpenditureReport";
import DebtorsReport from "./DebtorsReport";
import { readWorkbook, parseTransactionSheet, parseAmount, parseDateString } from "../lib/parseExcel";

interface DocumentsInput {
  cashAtBank: Record<string, unknown>[];
  dayBooksReceipts: Record<string, unknown>[];
  nomactx: Record<string, unknown>[];
  pnl: Record<string, unknown>[];
}

export default function ReportsPage() {
  const [appState, setAppState] = useState<"input" | "display">("input");
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const cashAtBankRef = useRef<HTMLDivElement>(null);
  const expenditureRef = useRef<HTMLDivElement>(null);
  const debtorsRef = useRef<HTMLDivElement>(null);

  const getRowValue = (row: Record<string, unknown>, keys: string[]): unknown => {
    const lowerKeys = Object.keys(row).map((k) => k.toLowerCase());
    for (const target of keys) {
      const idx = lowerKeys.findIndex((key) => key.includes(target));
      if (idx !== -1) {
        return Object.values(row)[idx];
      }
    }

    if (typeof row.rawText === "string") {
      return row.rawText;
    }

    return "";
  };

  const extractPdfTextLines = (textContent: any) => {
    const lines = new Map<number, string[]>();
    textContent.items.forEach((item: any) => {
      const y = item.transform?.[5] ? Math.round(item.transform[5]) : 0;
      const line = (lines.get(y) ?? []).concat(item.str);
      lines.set(y, line);
    });

    return Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  };

  const parsePdfRows = async (file: File): Promise<Record<string, unknown>[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;

    const rows: Record<string, unknown>[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageLines = extractPdfTextLines(textContent);

      for (const line of pageLines) {
        const lower = line.toLowerCase();
        if (/^\s*(page|date|transaction|totals?|history balance|account balance|opening balance|closing balance|n\/c|ref|statement|name|nominal activity|car|bank|page:)/i.test(line)) {
          continue;
        }
        if (!/[\d]/.test(line)) {
          continue;
        }
        rows.push({ rawText: line });
      }
    }
    return rows;
  };

  const parseRowsFromFile = async (file: File): Promise<Record<string, unknown>[]> => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".pdf")) {
      return parsePdfRows(file);
    }

    const workbook = await readWorkbook(file);
    const sheetName = workbook.sheetNames[0];
    const { rows } = parseTransactionSheet(workbook.buffer, sheetName);
    return rows;
  };

  const getDebitCreditAmount = (row: Record<string, unknown>): number | null => {
    const debit = parseAmount(getRowValue(row, ["debit", "withdrawal", "withdrawals", "out"]));
    const credit = parseAmount(getRowValue(row, ["credit", "deposit", "deposits", "in"]));

    if (debit !== 0 || credit !== 0) {
      return credit - debit;
    }

    return null;
  };

  const parseAmountFromRawText = (rawText: string): number => {
    const matches = Array.from(rawText.matchAll(/-?[0-9,]+(?:\.[0-9]+)?/g)).map((m) => m[0]);
    if (matches.length === 0) return 0;
    return parseAmount(matches[matches.length - 1]);
  };

  const normalizeRowAmount = (row: Record<string, unknown>): number => {
    const rawAmount = getRowValue(row, ["amount", "amt", "value", "total"]);
    const explicitAmount = parseAmount(rawAmount);
    if (explicitAmount !== 0) {
      return explicitAmount;
    }

    const debitCreditAmount = getDebitCreditAmount(row);
    if (debitCreditAmount !== null) {
      return debitCreditAmount;
    }

    if (typeof row.rawText === "string") {
      return parseAmountFromRawText(row.rawText);
    }

    return parseAmount(getRowValue(row, ["debit", "credit"]));
  };

  const normalizeRowDate = (row: Record<string, unknown>): string => {
    return parseDateString(
      getRowValue(row, ["date", "transaction date", "value date", "invoice date", "payment date", "due date"])
    );
  };

  const normalizeRowString = (row: Record<string, unknown>, keys: string[], fallback = ""): string => {
    const value = getRowValue(row, keys);
    return String(value ?? fallback).trim();
  };

  const buildExpenditureItems = (rows: Record<string, unknown>[]): ExpenditureItem[] => {
    return rows
      .map((row) => {
        const amount = normalizeRowAmount(row);
        if (amount === 0) return null;

        const description = normalizeRowString(row, ["description", "details", "narrative", "memo", "particulars", "text", "transaction"]);
        const category = normalizeRowString(row, ["category", "type", "group", "nominal", "account", "department"], "Other");
        const accountName = normalizeRowString(row, ["account", "bank", "card", "ledger", "nominal"]);
        const bankInterestMatch = /bank interest|interest/i.test(`${description} ${accountName}`);

        return {
          date: normalizeRowDate(row),
          description,
          category: bankInterestMatch ? "Bank Interest" : category,
          amount,
          account: accountName,
        };
      })
      .filter((item): item is ExpenditureItem => item !== null);
  };

  const buildDebtorItems = (rows: Record<string, unknown>[]): DebtorItem[] => {
    return rows
      .map((row) => {
        const amount = normalizeRowAmount(row);
        if (amount === 0) return null;

        return {
          name: normalizeRowString(row, ["debtor_name", "debtor", "name", "customer", "client", "company"]),
          reference: normalizeRowString(row, ["reference", "invoice_no", "invoice", "ref", "inv"], ""),
          amount,
          date: normalizeRowDate(row),
          status: normalizeRowString(row, ["status", "payment status", "state", "invoice status"], "Outstanding"),
          notes: normalizeRowString(row, ["notes", "remarks", "comment", "description", "details"], ""),
        };
      })
      .filter((item): item is DebtorItem => item !== null && item.name !== "");
  };

  const buildCashAtBankItems = (rows: Record<string, unknown>[]): CashAtBankItem[] => {
    return rows
      .map((row) => {
        const balance = normalizeRowAmount(row);
        if (balance === 0) return null;

        const name = normalizeRowString(row, ["name", "account", "description", "details", "item"], "");
        const code = normalizeRowString(row, ["n/c", "code", "account number", "ref", "id"], "");
        if (!name && !code) return null;

        const lowerName = name.toLowerCase();
        const category = lowerName.includes("bank interest")
          ? "Bank Interest"
          : lowerName.includes("saving") || lowerName.includes("savings")
          ? "Saving"
          : lowerName.includes("current")
          ? "Current"
          : "Other";

        return {
          code,
          name,
          balance,
          category,
        };
      })
      .filter((item): item is CashAtBankItem => item !== null && (item.name !== "" || item.code !== ""));
  };

  const processDocuments = async (documents: DocumentsInput) => {
    setLoading(true);
    try {
      const expenditures: ExpenditureItem[] = [
        ...buildExpenditureItems(documents.dayBooksReceipts),
        ...buildExpenditureItems(documents.nomactx),
        ...buildExpenditureItems(documents.pnl),
      ];

      const debtorsItems = buildDebtorItems(documents.cashAtBank);
      const cashAtBankItems = buildCashAtBankItems(documents.cashAtBank);

      expenditures.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });

      const expenditureTotal = expenditures.reduce((sum, item) => sum + item.amount, 0);
      const debtorsTotal = debtorsItems.reduce((sum, item) => sum + item.amount, 0);
      const cashAtBankTotal = cashAtBankItems.reduce((sum, item) => sum + item.balance, 0);

      const newReportData: ReportData = {
        expenditure: {
          items: expenditures,
          total: expenditureTotal,
          categories: [...new Set(expenditures.map((i) => i.category))],
        },
        debtors: {
          items: debtorsItems,
          total: debtorsTotal,
          outstandingCount: debtorsItems.filter((d) => d.status.toLowerCase().includes("outstanding")).length,
        },
        cashAtBank: {
          items: cashAtBankItems,
          total: cashAtBankTotal,
        },
        generatedAt: new Date().toLocaleDateString(),
      };

      setReportData(newReportData);
      setAppState("display");
    } catch (error) {
      console.error("Error processing documents:", error);
      alert("Error processing documents. Please check the format and column names.");
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentUpload = async (
    cashAtBankFile: File,
    dayBooksFile: File,
    nomactxFile: File,
    pnlFile: File
  ) => {
    const [cashAtBank, dayBooksReceipts, nomactx, pnl] = await Promise.all([
      parseRowsFromFile(cashAtBankFile),
      parseRowsFromFile(dayBooksFile),
      parseRowsFromFile(nomactxFile),
      parseRowsFromFile(pnlFile),
    ]);

    await processDocuments({ cashAtBank, dayBooksReceipts, nomactx, pnl });
  };

  const downloadPDF = async (
    ref: React.RefObject<HTMLDivElement | null>,
    fileName: string
  ) => {
    if (!ref.current) return;

    try {
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const imgData = canvas.toDataURL("image/png");
      const imgWidth = 210; // A4 width in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let yPosition = 0;
      let pageHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, "PNG", 0, yPosition, imgWidth, imgHeight);

      let pages = Math.ceil(imgHeight / pageHeight);
      for (let i = 1; i < pages; i++) {
        pdf.addPage();
        pdf.addImage(
          imgData,
          "PNG",
          0,
          yPosition - pageHeight * i,
          imgWidth,
          imgHeight
        );
      }

      pdf.save(`${fileName}_${reportData?.generatedAt}.pdf`);
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Error generating PDF");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Nav */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <span className="font-bold text-gray-900 dark:text-white text-lg">
              Financial Reports
            </span>
          </div>
          {appState === "display" && (
            <button
              onClick={() => setAppState("input")}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              New Report
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {/* INPUT STATE */}
        {appState === "input" && (
          <DocumentUploadForm
            onSubmit={handleDocumentUpload}
            loading={loading}
          />
        )}

        {/* DISPLAY STATE */}
        {appState === "display" && reportData && (
          <div className="space-y-8">
            {/* Cash at Bank Report */}
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Cash at Bank
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Current and saving accounts
                  </p>
                </div>
                <button
                  onClick={() => downloadPDF(cashAtBankRef, "cash-at-bank-report")}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  Download PDF
                </button>
              </div>
              <div ref={cashAtBankRef} className="overflow-x-auto mb-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Code</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Account</th>
                      <th className="text-left py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Type</th>
                      <th className="text-right py-2 px-3 font-semibold text-gray-700 dark:text-gray-300">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.cashAtBank.items.map((item, idx) => (
                      <tr key={idx} className="border-b border-gray-200 dark:border-gray-700">
                        <td className="py-2 px-3 text-gray-900 dark:text-white font-mono">{item.code}</td>
                        <td className="py-2 px-3 text-gray-900 dark:text-white">{item.name}</td>
                        <td className="py-2 px-3 text-gray-600 dark:text-gray-400">{item.category}</td>
                        <td className="py-2 px-3 text-right font-semibold text-gray-900 dark:text-white">£{item.balance.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                      <td colSpan={3} className="py-3 px-3 font-bold text-gray-900 dark:text-white">Total Cash at Bank</td>
                      <td className="py-3 px-3 text-right font-bold text-gray-900 dark:text-white">£{reportData.cashAtBank.total.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Expenditure Report */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Expenditure Report
                </h2>
                <button
                  onClick={() => downloadPDF(expenditureRef, "expenditure-report")}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  Download PDF
                </button>
              </div>
              <div ref={expenditureRef}>
                <ExpenditureReport data={reportData.expenditure} />
              </div>
            </div>

            {/* Debtors Report */}
            <div className="mt-12">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Debtors Report
                </h2>
                <button
                  onClick={() => downloadPDF(debtorsRef, "debtors-report")}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  Download PDF
                </button>
              </div>
              <div ref={debtorsRef}>
                <DebtorsReport data={reportData.debtors} />
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Document Upload Form Component
// ─────────────────────────────────────────────────────────────────────────────

interface DocumentUploadFormProps {
  onSubmit: (
    cashAtBank: File,
    dayBooks: File,
    nomactx: File,
    pnl: File
  ) => void;
  loading: boolean;
}

function DocumentUploadForm({ onSubmit, loading }: DocumentUploadFormProps) {
  const [files, setFiles] = useState<{
    cashAtBank: File | null;
    dayBooks: File | null;
    nomactx: File | null;
    pnl: File | null;
  }>({
    cashAtBank: null,
    dayBooks: null,
    nomactx: null,
    pnl: null,
  });

  const handleFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    key: keyof typeof files
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".xlsx") &&
          !file.name.toLowerCase().endsWith(".xls") &&
          !file.name.toLowerCase().endsWith(".pdf")) {
        alert("Please upload an Excel or PDF document.");
        return;
      }
      setFiles((prev) => ({ ...prev, [key]: file }));
    }
  };

  const handleSubmit = () => {
    if (files.cashAtBank && files.dayBooks && files.nomactx && files.pnl) {
      onSubmit(files.cashAtBank, files.dayBooks, files.nomactx, files.pnl);
    } else {
      alert("Please upload all four documents");
    }
  };

  const documentTypes = [
    { key: "cashAtBank", label: "Cash at Bank", icon: "🏦" },
    { key: "dayBooks", label: "Day Books Receipts", icon: "📝" },
    { key: "nomactx", label: "Nomactx", icon: "📋" },
    { key: "pnl", label: "P&L", icon: "💹" },
  ] as const;

  return (
    <div className="flex flex-col items-center gap-8">
      <div className="text-center max-w-xl">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Generate Financial Reports
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Upload your financial documents to generate expenditure and debtors reports
        </p>
      </div>

      <div className="w-full max-w-2xl grid grid-cols-1 md:grid-cols-2 gap-4">
        {documentTypes.map(({ key, label, icon }) => (
          <div key={key} className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg hover:border-blue-400 dark:hover:border-blue-600 transition">
            <label className="cursor-pointer block">
              <div className="flex flex-col items-center gap-2 py-6">
                <span className="text-3xl">{icon}</span>
                <div className="text-center">
                  <p className="font-medium text-gray-700 dark:text-gray-300">
                    {label}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {files[key as keyof typeof files]?.name || "Click to upload"}
                  </p>
                </div>
              </div>
              <input
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={(e) => handleFileChange(e, key as keyof typeof files)}
                className="hidden"
              />
            </label>
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || !files.cashAtBank || !files.dayBooks || !files.nomactx || !files.pnl}
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium"
      >
        {loading ? "Processing..." : "Generate Reports"}
      </button>
    </div>
  );
}
