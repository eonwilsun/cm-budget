"use client";

import React, { useState, useRef } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import type { ReportData, ExpenditureItem, DebtorItem } from "../types";
import ExpenditureReport from "./ExpenditureReport";
import DebtorsReport from "./DebtorsReport";

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
  const expenditureRef = useRef<HTMLDivElement>(null);
  const debtorsRef = useRef<HTMLDivElement>(null);

  // Process uploaded documents into structured reports
  const processDocuments = async (documents: DocumentsInput) => {
    setLoading(true);
    try {
      // Extract expenditure data from PNL and Day books
      const expenditureItems: ExpenditureItem[] = [];
      
      // Process day books receipts for expenditures
      if (documents.dayBooksReceipts && Array.isArray(documents.dayBooksReceipts)) {
        documents.dayBooksReceipts.forEach((row: Record<string, unknown>) => {
          if (row.description && row.amount) {
            expenditureItems.push({
              date: String(row.date || ""),
              description: String(row.description),
              category: String(row.category || "Other"),
              amount: Number(row.amount) || 0,
              account: String(row.account || ""),
            });
          }
        });
      }

      // Extract debtors data
      const debtorsItems: DebtorItem[] = [];
      
      if (documents.cashAtBank && Array.isArray(documents.cashAtBank)) {
        documents.cashAtBank.forEach((row: Record<string, unknown>) => {
          if (row.debtor_name || row.name) {
            debtorsItems.push({
              name: String(row.debtor_name || row.name),
              reference: String(row.reference || row.invoice_no || ""),
              amount: Number(row.amount || 0),
              date: String(row.date || ""),
              status: String(row.status || "Outstanding"),
              notes: String(row.notes || ""),
            });
          }
        });
      }

      // Sort expenditure by date
      expenditureItems.sort((a, b) => {
        const dateA = new Date(a.date);
        const dateB = new Date(b.date);
        return dateB.getTime() - dateA.getTime();
      });

      // Calculate totals
      const expenditureTotal = expenditureItems.reduce((sum, item) => sum + item.amount, 0);
      const debtorsTotal = debtorsItems.reduce((sum, item) => sum + item.amount, 0);

      const newReportData: ReportData = {
        expenditure: {
          items: expenditureItems,
          total: expenditureTotal,
          categories: [...new Set(expenditureItems.map((i) => i.category))],
        },
        debtors: {
          items: debtorsItems,
          total: debtorsTotal,
          outstandingCount: debtorsItems.filter((d) => d.status === "Outstanding").length,
        },
        generatedAt: new Date().toLocaleDateString(),
      };

      setReportData(newReportData);
      setAppState("display");
    } catch (error) {
      console.error("Error processing documents:", error);
      alert("Error processing documents. Please check the format.");
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
    // This is a placeholder - in production, you'd parse the Excel/CSV files
    // using the existing parseExcel/parseCSV functions from your lib
    const documents: DocumentsInput = {
      cashAtBank: [],
      dayBooksReceipts: [],
      nomactx: [],
      pnl: [],
    };

    // For now, use mock data
    documents.dayBooksReceipts = [
      {
        date: "2024-01-15",
        description: "Office Supplies",
        category: "Supplies",
        amount: 250,
        account: "General",
      },
      {
        date: "2024-01-10",
        description: "Client Meeting Expenses",
        category: "Travel",
        amount: 125,
        account: "Travel",
      },
    ];

    documents.cashAtBank = [
      {
        name: "ABC Ltd",
        reference: "INV-001",
        amount: 5000,
        date: "2023-12-01",
        status: "Outstanding",
        notes: "Payment pending",
      },
      {
        name: "XYZ Corp",
        reference: "INV-002",
        amount: 3200,
        date: "2023-11-15",
        status: "Outstanding",
        notes: "",
      },
    ];

    await processDocuments(documents);
  };

  const downloadPDF = async (
    ref: React.RefObject<HTMLDivElement>,
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
                accept=".xlsx,.xls,.csv"
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
