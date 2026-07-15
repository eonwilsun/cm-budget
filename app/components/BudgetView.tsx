"use client";

import React, { useState, useRef, useCallback } from "react";
import type { ParsedBudget } from "../types";
import BudgetDashboard from "./BudgetDashboard";
import BudgetTable, { sectionAnchorId } from "./BudgetTable";
import { downloadAsPNG, downloadAsPDF } from "../lib/exportUtils";
import { getSharedBudgetConfig } from "../lib/sharedBudget";

interface BudgetViewProps {
  budget: ParsedBudget;
  fileName: string;
  onReset: () => void;
  isSavedBudget?: boolean;
  onBudgetChange?: (budget: ParsedBudget) => void;
  onSaveAsSavedBudget?: (budget: ParsedBudget) => void;
}

type Tab = "dashboard" | "report";

function allSectionNames(budget: ParsedBudget): Set<string> {
  return new Set(budget.rows.filter((r) => r.rowType === "section").map((r) => r.sectionName || r.name));
}

function allSubsectionNames(budget: ParsedBudget): Set<string> {
  return new Set(
    budget.rows
      .filter((r) => r.rowType === "subsection")
      .map((r) => `${r.sectionName}::${r.name}`)
  );
}

export default function BudgetView({ budget, fileName, onReset, isSavedBudget = false, onBudgetChange, onSaveAsSavedBudget }: BudgetViewProps) {
  const sharedBudget = getSharedBudgetConfig();
  const [activeTab, setActiveTab] = useState<Tab>("report");
  const [editMode, setEditMode] = useState(false);

  // Collapse state — all sections/subsections collapsed by default
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => allSectionNames(budget));
  const [expandedSubsections, setExpandedSubsections] = useState<Set<string>>(() => allSubsectionNames(budget));

  // Download state
  const [exporting, setExporting] = useState<string | null>(null);

  // Refs for capture
  const dashboardRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);

  // ── Section / subsection toggle helpers ──────────────────────────────────
  const toggleSection = useCallback((name: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(name)) { next.delete(name); } else { next.add(name); }
      return next;
    });
  }, []);

  const toggleSubsection = useCallback((sectionName: string, subsName: string) => {
    const key = `${sectionName}::${subsName}`;
    setExpandedSubsections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSections(allSectionNames(budget));
    setExpandedSubsections(allSubsectionNames(budget));
  }, [budget.rows]);

  const collapseAll = useCallback(() => {
    setExpandedSections(new Set());
    setExpandedSubsections(new Set());
  }, []);

  // ── Navigation helpers ────────────────────────────────────────────────────
  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const goToDashboard = useCallback(() => {
    setActiveTab("dashboard");
    setTimeout(() => scrollTo("budget-dashboard-section"), 50);
  }, [scrollTo]);

  const goToReport = useCallback(() => {
    setActiveTab("report");
    setTimeout(() => scrollTo("budget-report-section"), 50);
  }, [scrollTo]);

  const goToSection = useCallback(
    (sectionName: string) => {
      // Ensure the tab is on report and the section is expanded
      setActiveTab("report");
      setExpandedSections((prev) => {
        const next = new Set(prev);
        next.add(sectionName);
        return next;
      });
      setTimeout(() => scrollTo(sectionAnchorId(sectionName)), 80);
    },
    [scrollTo]
  );

  // Sections with their types for nav buttons
  const sectionRows = budget.rows.filter((r) => r.rowType === "section");
  const incomeSections = sectionRows.filter((r) => r.sectionType === "income");
  const expendSections = sectionRows.filter((r) => r.sectionType === "expenditure");
  const totalRows = budget.rows.filter((r) => r.rowType === "total" || r.rowType === "net");

  // ── Export helpers ────────────────────────────────────────────────────────
  async function handleExport(action: () => Promise<void>, key: string) {
    setExporting(key);
    try {
      await action();
    } catch (error) {
      console.error("Export failed", error);
      window.alert("Download failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  const exportDashboardPNG = () =>
    handleExport(async () => {
      if (dashboardRef.current) await downloadAsPNG(dashboardRef.current, "cm-budget-dashboard.png");
    }, "dash-png");

  const exportDashboardPDF = () =>
    handleExport(async () => {
      if (dashboardRef.current)
        await downloadAsPDF(
          [{ element: dashboardRef.current, title: "Budget Dashboard" }],
          "cm-budget-dashboard.pdf",
          `CM Budget – ${budget.sheetName}${budget.year ? ` ${budget.year}` : ""}`
        );
    }, "dash-pdf");

  const exportReportPNG = () =>
    handleExport(async () => {
      if (reportRef.current) {
        // Expand all before capture so nothing is hidden
        expandAll();
        await new Promise((r) => setTimeout(r, 120));
        await downloadAsPNG(reportRef.current, "cm-budget-report.png");
      }
    }, "rep-png");

  const exportReportPDF = () =>
    handleExport(async () => {
      if (reportRef.current) {
        expandAll();
        await new Promise((r) => setTimeout(r, 120));
        await downloadAsPDF(
          [{ element: reportRef.current, title: "Budget Report Table" }],
          "cm-budget-report.pdf",
          `CM Budget – ${budget.sheetName}${budget.year ? ` ${budget.year}` : ""}`
        );
      }
    }, "rep-pdf");

  const handleRowTextChange = useCallback(
    (rowIndex: number, field: "code" | "name" | "notes", value: string) => {
      if (!onBudgetChange) return;
      const nextRows = budget.rows.map((row, index) => (
        index === rowIndex ? { ...row, [field]: value } : row
      ));
      onBudgetChange({ ...budget, rows: nextRows });
    },
    [budget, onBudgetChange]
  );

  const handleRowValueChange = useCallback(
    (rowIndex: number, columnKey: string, value: number | null) => {
      if (!onBudgetChange) return;
      const nextRows = budget.rows.map((row, index) => (
        index === rowIndex
          ? { ...row, values: { ...row.values, [columnKey]: value } }
          : row
      ));
      onBudgetChange({ ...budget, rows: nextRows });
    },
    [budget, onBudgetChange]
  );

  // ── UI helpers ────────────────────────────────────────────────────────────
  function NavBtn({
    label, onClick, color = "gray",
  }: { label: string; onClick: () => void; color?: string }) {
    const base = "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap";
    const variants: Record<string, string> = {
      gray:   "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600",
      blue:   "bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800",
      red:    "bg-red-100  dark:bg-red-900  text-red-700  dark:text-red-300  hover:bg-red-200  dark:hover:bg-red-800",
      green:  "bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-200",
    };
    return <button onClick={onClick} className={`${base} ${variants[color] ?? variants.gray}`}>{label}</button>;
  }

  function ExportBtn({ label, onClick, busy }: { label: string; onClick: () => void; busy: boolean }) {
    return (
      <button
        onClick={onClick}
        disabled={busy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors whitespace-nowrap"
      >
        {busy ? (
          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : null}
        {label}
      </button>
    );
  }


  return (
    <div className="space-y-0">
      <div className="sticky top-14 z-40 bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 -mx-4 sm:-mx-6 lg:-mx-8 mb-6 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Budget Report{budget.year ? ` ${budget.year}` : ""}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {fileName} · {budget.sheetName} · {budget.rows.filter((r) => r.rowType === "item").length} line items
              </p>
              {isSavedBudget && onBudgetChange && (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                  Saved locally in this browser. Manual edits update the saved budget automatically.
                </p>
              )}
              {!isSavedBudget && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                  This uploaded budget is temporary. It is not saved unless you press Save as Saved Budget.
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isSavedBudget && onBudgetChange && (
                <button
                  onClick={() => {
                    setActiveTab("report");
                    setEditMode((prev) => !prev);
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 ${editMode ? "bg-emerald-600 text-white hover:bg-emerald-700" : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"}`}
                >
                  {editMode ? "Done Editing" : "Edit Saved Budget"}
                </button>
              )}
              {!isSavedBudget && onSaveAsSavedBudget && (
                <button
                  onClick={() => onSaveAsSavedBudget(budget)}
                  className="px-4 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                >
                  Save as Saved Budget
                </button>
              )}
              <button
                onClick={onReset}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors shrink-0"
              >
                ↑ Upload New File
              </button>
            </div>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-4 sm:px-6 lg:px-8 py-2">
        <div className="flex flex-wrap items-center gap-2">
          {/* Jump to sections */}
          <span className="text-xs text-gray-400 dark:text-gray-500 font-medium shrink-0">Jump to:</span>
          <NavBtn label="📊 Dashboard" onClick={goToDashboard} color="gray" />
          <NavBtn label="📋 Report" onClick={goToReport} color="gray" />

          {incomeSections.map((r) => (
            <NavBtn key={r.name} label={`▸ ${r.name}`} onClick={() => goToSection(r.sectionName || r.name)} color="blue" />
          ))}
          {expendSections.map((r) => (
            <NavBtn key={r.name} label={`▸ ${r.name}`} onClick={() => goToSection(r.sectionName || r.name)} color="red" />
          ))}
          {totalRows.length > 0 && (
            <NavBtn label="▸ Totals" onClick={() => { setActiveTab("report"); setTimeout(() => scrollTo(sectionAnchorId(totalRows[0].sectionName || "total")), 80); }} color="gray" />
          )}

          {/* Separator */}
          <span className="text-gray-300 dark:text-gray-600 text-xs">|</span>

          {/* Collapse controls — only visible on report tab */}
          {activeTab === "report" && (
            <>
              <button
                onClick={expandAll}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                ↕ Expand All
              </button>
              <button
                onClick={collapseAll}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                ↕ Collapse All
              </button>
              <span className="text-gray-300 dark:text-gray-600 text-xs">|</span>
            </>
          )}

          {/* Export buttons */}
          {activeTab === "dashboard" ? (
            <>
              <ExportBtn label="⬇ PNG" onClick={exportDashboardPNG} busy={exporting === "dash-png"} />
              <ExportBtn label="📄 PDF" onClick={exportDashboardPDF} busy={exporting === "dash-pdf"} />
            </>
          ) : (
            <>
              <ExportBtn label="⬇ PNG" onClick={exportReportPNG} busy={exporting === "rep-png"} />
              <ExportBtn label="📄 PDF" onClick={exportReportPDF} busy={exporting === "rep-pdf"} />
            </>
          )}
        </div>
        </div>
      </div>

      {/* ── Tab selector ──────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex gap-1">
          {(["dashboard", "report"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors capitalize ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300"
              }`}
            >
              {tab === "dashboard" ? "📊 Dashboard" : "📋 Report Table"}
            </button>
          ))}
        </nav>
      </div>

      {/* ── DASHBOARD tab ─────────────────────────────────────────────────── */}
      {activeTab === "dashboard" && (
        <section id="budget-dashboard-section">
          <div ref={dashboardRef}>
            <BudgetDashboard budget={budget} />
          </div>
        </section>
      )}

      {/* ── REPORT TABLE tab ──────────────────────────────────────────────── */}
      {activeTab === "report" && (
        <section id="budget-report-section">
          {sharedBudget.breakdown.length > 0 && (
            <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-950/40">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                  Shared Budget Breakdown ({sharedBudget.year})
                </h3>
                <span className="text-sm font-bold text-blue-800 dark:text-blue-300">
                  {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(sharedBudget.totalBudget)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {sharedBudget.breakdown.map((item) => (
                  <div key={item.heading} className="flex items-center justify-between rounded bg-white/80 px-2 py-1 text-xs dark:bg-blue-950/50">
                    <span className="truncate text-blue-900 dark:text-blue-200">{item.heading}</span>
                    <span className="ml-2 font-medium text-blue-800 dark:text-blue-300">
                      {new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(item.amount)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-blue-700 dark:text-blue-400">
                Shared values are loaded from app/config/sharedBudget.json so everyone sees the same annual budget and heading breakdown.
              </p>
            </div>
          )}
          {/* Collapse hint */}
          <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Click a section or subsection header row to expand / collapse it. Use <strong>Expand All / Collapse All</strong> in the nav bar above.
          </p>
          {isSavedBudget && editMode && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              Editing mode is on. Change names, codes, or monthly figures here and the saved budget will be updated automatically.
            </div>
          )}
          <div ref={reportRef}>
            <BudgetTable
              budget={budget}
              expandedSections={expandedSections}
              expandedSubsections={expandedSubsections}
              onToggleSection={toggleSection}
              onToggleSubsection={toggleSubsection}
              editable={isSavedBudget && editMode}
              onRowTextChange={handleRowTextChange}
              onRowValueChange={handleRowValueChange}
              stickyTop="12rem"
            />
          </div>
        </section>
      )}
    </div>
  );
}
