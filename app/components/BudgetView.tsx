"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import type { ParsedBudget } from "../types";
import BudgetDashboard from "./BudgetDashboard";
import BudgetTable, { sectionAnchorId } from "./BudgetTable";
import { downloadAsPNG, downloadAsPDF } from "../lib/exportUtils";
import { getSharedBudgetConfig } from "../lib/sharedBudget";
import { parseAmount, parseTransactionSheet, readWorkbook } from "../lib/parseExcel";
import { getPdfJs } from "../lib/pdfText";

interface BudgetViewProps {
  budget: ParsedBudget;
  fileName: string;
  onReset: () => void;
  isSavedBudget?: boolean;
  hasSavedBudget?: boolean;
  onBudgetChange?: (budget: ParsedBudget) => void;
  onSaveAsSavedBudget?: (budget: ParsedBudget) => void;
  onClearSavedBudget?: () => void;
}

type Tab = "dashboard" | "report";

interface CashAtBankItem {
  code: string;
  name: string;
  balance: number;
}

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

function headingKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function fmtCash(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function applySharedBreakdownToBudget(budget: ParsedBudget): ParsedBudget {
  const sharedBudget = getSharedBudgetConfig();

  const columns = budget.columns;
  const budgetCol = columns.find((c) => c.isBudget);
  if (sharedBudget.breakdown.length === 0) return budget;

  const valueTemplate = Object.fromEntries(
    columns
      .filter((column) => column.isBudget || column.monthIndex !== null || column.isTotal)
      .map((column) => [column.key, null])
  );

  // Prefer an explicit section marked as expenditure. If none exists,
  // fall back to a best-effort guess (a section containing 'expend')
  // or finally the first section in the sheet. This ensures shared
  // budget items are inserted even when uploaded sheets don't set
  // `sectionType` correctly.
  let expendSection = budget.rows.find((row) => row.rowType === "section" && row.sectionType === "expenditure");
  let expendSectionName = expendSection?.sectionName || expendSection?.name || "";

  if (!expendSectionName) {
    const guessed = budget.rows.find((row) => row.rowType === "section" && String(row.sectionName || row.name || "").toLowerCase().includes("expend"));
    if (guessed) {
      expendSectionName = guessed.sectionName || guessed.name || "";
      expendSection = guessed;
    }
  }

  if (!expendSectionName) {
    const firstSection = budget.rows.find((row) => row.rowType === "section");
    if (firstSection) {
      expendSectionName = firstSection.sectionName || firstSection.name || "";
      expendSection = firstSection;
    }
  }

  const rowsWithSharedStructure = [...budget.rows];

  if (expendSectionName) {
    const keyOf = (value: string) => headingKey(value);

    const findSubsectionIndex = (subsectionName: string) => rowsWithSharedStructure.findIndex(
      (row) => row.rowType === "subsection" && row.sectionName === expendSectionName && keyOf(row.name) === keyOf(subsectionName)
    );

    const findItemIndex = (itemName: string) => rowsWithSharedStructure.findIndex(
      (row) => row.rowType === "item" && row.sectionName === expendSectionName && keyOf(row.name) === keyOf(itemName)
    );

    const expenditureTotalIndex = () => rowsWithSharedStructure.findIndex(
      (row) => row.rowType === "total" && row.sectionType === "expenditure"
    );

    const sectionEndIndex = () => {
      const sectionIndex = rowsWithSharedStructure.findIndex(
        (row) => row.rowType === "section" && (row.sectionName || row.name) === expendSectionName
      );
      if (sectionIndex === -1) return rowsWithSharedStructure.length;
      for (let i = sectionIndex + 1; i < rowsWithSharedStructure.length; i += 1) {
        const row = rowsWithSharedStructure[i];
        if (row.rowType === "section") {
          return i;
        }
      }
      return rowsWithSharedStructure.length;
    };

    const insertSubsection = (subsectionName: string): number => {
      const totalIndex = expenditureTotalIndex();
      const fallbackIndex = sectionEndIndex();
      const insertAt = totalIndex >= 0 ? totalIndex : fallbackIndex;
      rowsWithSharedStructure.splice(insertAt, 0, {
        code: "",
        name: subsectionName,
        notes: "",
        values: { ...valueTemplate },
        rowType: "subsection",
        sectionName: expendSectionName,
        sectionType: "expenditure",
        subsectionName: "",
        indent: 0,
      });
      return insertAt;
    };

    const ensureSubsection = (subsectionName: string): number => {
      const subsectionIndex = findSubsectionIndex(subsectionName);
      return subsectionIndex === -1 ? insertSubsection(subsectionName) : subsectionIndex;
    };

    const itemInsertIndex = (subsectionName: string): number => {
      const subsectionIndex = ensureSubsection(subsectionName);

      let insertAt = subsectionIndex + 1;
      while (insertAt < rowsWithSharedStructure.length) {
        const row = rowsWithSharedStructure[insertAt];
        if (row.rowType === "subsection" || row.rowType === "total" || row.rowType === "section" || row.rowType === "net") {
          break;
        }
        if (row.rowType === "item" && row.subsectionName !== subsectionName) {
          break;
        }
        insertAt += 1;
      }

      return insertAt;
    };

    const insertItem = (itemName: string, subsectionName: string) => {
      let subsectionIndex = findSubsectionIndex(subsectionName);
      if (subsectionIndex === -1) {
        subsectionIndex = insertSubsection(subsectionName);
      }

      const insertAt = itemInsertIndex(rowsWithSharedStructure[subsectionIndex].name);

      rowsWithSharedStructure.splice(insertAt, 0, {
        code: "",
        name: itemName,
        notes: "",
        values: { ...valueTemplate },
        rowType: "item",
        sectionName: expendSectionName,
        sectionType: "expenditure",
        subsectionName,
        indent: 2,
      });
    };

    const moveItemToSubsection = (itemName: string, subsectionName: string) => {
      ensureSubsection(subsectionName);

      const itemIndex = findItemIndex(itemName);
      if (itemIndex === -1) {
        insertItem(itemName, subsectionName);
        return;
      }

      const existingRow = rowsWithSharedStructure[itemIndex];
      if (existingRow.rowType !== "item") {
        return;
      }

      if (headingKey(existingRow.subsectionName) === headingKey(subsectionName)) {
        return;
      }

      const [rowToMove] = rowsWithSharedStructure.splice(itemIndex, 1);
      const insertAt = itemInsertIndex(subsectionName);
      rowsWithSharedStructure.splice(insertAt, 0, {
        ...rowToMove,
        sectionName: expendSectionName,
        sectionType: "expenditure",
        subsectionName,
        indent: 2,
      });
    };

    let activeSubsectionName = "";

    for (const sharedItem of sharedBudget.breakdown) {
      const heading = sharedItem.heading;
      if (!heading.trim()) continue;

      if (sharedItem.subsectionHeading?.trim()) {
        const targetSubsectionName = sharedItem.subsectionHeading.trim();
        moveItemToSubsection(heading, targetSubsectionName);
        activeSubsectionName = targetSubsectionName;
        continue;
      }

      const subsectionIndex = findSubsectionIndex(heading);
      if (subsectionIndex !== -1) {
        activeSubsectionName = rowsWithSharedStructure[subsectionIndex].name;
        continue;
      }

      const itemIndex = findItemIndex(heading);
      if (itemIndex !== -1) {
        const itemSubsection = rowsWithSharedStructure[itemIndex].subsectionName;
        if (itemSubsection) {
          activeSubsectionName = itemSubsection;
        }
        continue;
      }

      if (!activeSubsectionName) {
        // No known subsection yet; treat this heading as a new subsection anchor.
        insertSubsection(heading);
        activeSubsectionName = heading;
        continue;
      }

      insertItem(heading, activeSubsectionName);
    }

    // Ensure any sharedBudget items that still don't exist in the uploaded
    // budget are explicitly inserted. This guarantees items like
    // "Accountancy" are added when the uploaded sheet doesn't include them.
    for (const sharedItem of sharedBudget.breakdown) {
      const itemName = sharedItem.heading;
      if (!itemName.trim()) continue;
      const idx = findItemIndex(itemName);
      if (idx === -1) {
        const targetSub = sharedItem.subsectionHeading?.trim() || itemName;
        // If the shared item name equals the subsection name, don't
        // insert a duplicate item row; ensure the subsection exists instead.
        if (headingKey(targetSub) === headingKey(itemName)) {
          ensureSubsection(targetSub);
        } else {
          insertItem(itemName, targetSub);
        }
      }
    }
  }

  // If there's no budget column in the uploaded sheet, stop here and return
  // the budget with the missing subsections/items inserted (but without
  // writing any amounts). This keeps inserted rows visible like the rest.
  if (!budgetCol) {
    return {
      ...budget,
      rows: rowsWithSharedStructure,
    };
  }

  const amountByHeading = new Map<string, number>();
  for (const item of sharedBudget.breakdown) {
    const key = headingKey(item.heading);
    const existing = amountByHeading.get(key) ?? 0;
    amountByHeading.set(key, existing + item.amount);
  }

  // Sum amounts by subsection heading as well so subsections receive
  // direct totals when sharedBudget lists multiple items under one group.
  const subsectionTotals = new Map<string, number>();
  for (const item of sharedBudget.breakdown) {
    if (!item.subsectionHeading) continue;
    const key = headingKey(item.subsectionHeading);
    const existing = subsectionTotals.get(key) ?? 0;
    subsectionTotals.set(key, existing + item.amount);
  }

  const subsectionDirectAmounts = new Map<string, number>();
  for (const row of rowsWithSharedStructure) {
    if (row.rowType !== "subsection") continue;
    const key = headingKey(row.name);
    const direct = amountByHeading.get(key);
    const subTotal = subsectionTotals.get(key);
    const value = direct !== undefined ? direct : subTotal;
    if (value !== undefined) {
      subsectionDirectAmounts.set(`${row.sectionName}::${row.name}`, value);
    }
  }

  const rowsWithItemBudgets = rowsWithSharedStructure.map((row) => {
    if (row.rowType !== "item") {
      return row;
    }

    const mappedAmount = amountByHeading.get(headingKey(row.name));
    if (mappedAmount === undefined) {
      // For expenditure rows, budget values should come only from sharedBudget.
      // If an uploaded sheet has extra expenditure items not present in
      // sharedBudget, force their budget value to zero so section totals match
      // the shared configuration.
      const inExpenditureSection =
        row.sectionType === "expenditure"
        || (expendSectionName.trim().length > 0 && headingKey(row.sectionName) === headingKey(expendSectionName));

      if (inExpenditureSection) {
        return {
          ...row,
          values: {
            ...row.values,
            [budgetCol.key]: 0,
          },
        };
      }
      return row;
    }

    return {
      ...row,
      values: {
        ...row.values,
        [budgetCol.key]: mappedAmount,
      },
    };
  });

  const itemRows = rowsWithItemBudgets.filter((row) => row.rowType === "item");

  const subtotalFromItems = (sectionName: string, subsectionName: string): number => {
    return itemRows.reduce((sum, item) => {
      if (item.sectionName !== sectionName || item.subsectionName !== subsectionName) return sum;
      return sum + (item.values[budgetCol.key] ?? 0);
    }, 0);
  };

  const sectionBudgetTotal = (sectionName: string): number => {
    let total = 0;

    for (const item of itemRows) {
      if (item.sectionName !== sectionName) continue;

      if (item.subsectionName) {
        const subsectionKey = `${item.sectionName}::${item.subsectionName}`;
        if (subsectionDirectAmounts.has(subsectionKey)) {
          continue;
        }
      }

      total += item.values[budgetCol.key] ?? 0;
    }

    for (const [subsectionKey, amount] of subsectionDirectAmounts.entries()) {
      const [subSectionName] = subsectionKey.split("::");
      if (subSectionName === sectionName) {
        total += amount;
      }
    }

    return total;
  };

  const incomeSectionNames = new Set(
    budget.rows
      .filter((row) => row.rowType === "section" && row.sectionType === "income")
      .map((row) => row.sectionName || row.name)
  );

  const expenditureSectionNames = new Set(
    budget.rows
      .filter((row) => row.rowType === "section" && row.sectionType === "expenditure")
      .map((row) => row.sectionName || row.name)
  );

  const incomeBudgetTotal = Array.from(incomeSectionNames).reduce((sum, sectionName) => sum + sectionBudgetTotal(sectionName), 0);
  const expenditureBudgetTotal = Array.from(expenditureSectionNames).reduce((sum, sectionName) => sum + sectionBudgetTotal(sectionName), 0);

  const normalizedRows = rowsWithItemBudgets.map((row) => {
    if (row.rowType === "item") {
      return row;
    }

    if (row.rowType === "subsection") {
      const subsectionKey = `${row.sectionName}::${row.name}`;
      const subtotal = subsectionDirectAmounts.get(subsectionKey) ?? subtotalFromItems(row.sectionName, row.name);
      return {
        ...row,
        values: {
          ...row.values,
          [budgetCol.key]: subtotal,
        },
      };
    }

    if (row.rowType === "section") {
      const sectionName = row.sectionName || row.name;
      return {
        ...row,
        values: {
          ...row.values,
          [budgetCol.key]: sectionBudgetTotal(sectionName),
        },
      };
    }

    if (row.rowType === "total") {
      let total = 0;
      if (row.sectionType === "income") {
        total = incomeBudgetTotal;
      } else if (row.sectionType === "expenditure") {
        total = expenditureBudgetTotal;
      }

      return {
        ...row,
        values: {
          ...row.values,
          [budgetCol.key]: total,
        },
      };
    }

    if (row.rowType === "net") {
      return {
        ...row,
        values: {
          ...row.values,
          [budgetCol.key]: incomeBudgetTotal - expenditureBudgetTotal,
        },
      };
    }

    return row;
  });

  return {
    ...budget,
    columns,
    rows: normalizedRows,
  };
}

export default function BudgetView({ budget, fileName, onReset, isSavedBudget = false, hasSavedBudget = false, onBudgetChange, onSaveAsSavedBudget, onClearSavedBudget }: BudgetViewProps) {
  const budgetWithSharedBreakdown = applySharedBreakdownToBudget(budget);
  const [activeTab, setActiveTab] = useState<Tab>("report");
  const [editMode, setEditMode] = useState(false);
  const [cashAtBankItems, setCashAtBankItems] = useState<CashAtBankItem[]>([]);
  const [cashDropActive, setCashDropActive] = useState(false);
  const [cashUploadLoading, setCashUploadLoading] = useState(false);

  // Collapse state — all sections/subsections collapsed by default
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => allSectionNames(budget));
  const [expandedSubsections, setExpandedSubsections] = useState<Set<string>>(() => allSubsectionNames(budget));

  // Download state
  const [exporting, setExporting] = useState<string | null>(null);

  // Refs for capture
  const dashboardRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef<HTMLDivElement>(null);
  const cashFileInputRef = useRef<HTMLInputElement>(null);

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

  const extractPdfTextLines = (textContent: { items: Array<{ str?: string; transform?: number[] }> }) => {
    const lines = new Map<number, string[]>();
    textContent.items.forEach((item) => {
      const y = item.transform?.[5] ? Math.round(item.transform[5]) : 0;
      const line = (lines.get(y) ?? []).concat(item.str ?? "");
      lines.set(y, line);
    });

    return Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);
  };

  const parseCashAtBankSummaryRows = async (file: File): Promise<Record<string, unknown>[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await getPdfJs();
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
    const pdf = await loadingTask.promise;

    const rows: Record<string, unknown>[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const pageLines = extractPdfTextLines(textContent);

      for (const line of pageLines) {
        const normalizedLine = line.trim();
        if (/^(report run|page:|to period|cash at bank|n\/c|name|balance|totals?:)$/i.test(normalizedLine)) {
          continue;
        }

        const rowMatch = normalizedLine.match(/^(\d{3,6})\s+(.+?)\s+([0-9,]+(?:\.\d{2})?)$/);
        if (!rowMatch) {
          continue;
        }

        rows.push({
          code: rowMatch[1].trim(),
          name: rowMatch[2].trim(),
          balance: parseAmount(rowMatch[3]),
        });
      }
    }

    return rows;
  };

  const parseCashRowsFromFile = async (file: File): Promise<Record<string, unknown>[]> => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith(".pdf")) {
      return parseCashAtBankSummaryRows(file);
    }

    const workbook = await readWorkbook(file);
    const sheetName = workbook.sheetNames[0];
    const { rows } = parseTransactionSheet(workbook.buffer, sheetName);
    return rows;
  };

  const buildCashItems = (rows: Record<string, unknown>[]): CashAtBankItem[] => {
    return rows
      .map((row) => {
        const code = String(getRowValue(row, ["n/c", "code", "account number", "ref", "id"]) ?? "").trim();
        const name = String(getRowValue(row, ["name", "account", "description", "details", "item"]) ?? "").trim();
        const balance = parseAmount(getRowValue(row, ["balance", "amount", "value", "total"]));
        if (!name && !code) return null;
        if (balance === 0) return null;

        return { code, name, balance };
      })
      .filter((item): item is CashAtBankItem => item !== null);
  };

  const handleCashFileUpload = async (file: File) => {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls") && !lower.endsWith(".pdf")) {
      window.alert("Please upload an Excel or PDF document.");
      return;
    }

    setCashUploadLoading(true);
    try {
      const rows = await parseCashRowsFromFile(file);
      const items = buildCashItems(rows);
      if (items.length === 0) {
        window.alert("No cash-at-bank rows found in this file.");
        return;
      }

      setCashAtBankItems((prev) => [...prev, ...items]);
    } catch (error) {
      console.error("Could not append cash-at-bank file", error);
      window.alert("Could not append cash-at-bank file. Please check the format.");
    } finally {
      setCashUploadLoading(false);
    }
  };

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
    setExpandedSections(allSectionNames(budgetWithSharedBreakdown));
    setExpandedSubsections(allSubsectionNames(budgetWithSharedBreakdown));
  }, [budgetWithSharedBreakdown]);

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
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const goToReport = useCallback(() => {
    setActiveTab("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail === "dashboard") {
        setActiveTab("dashboard");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      if (customEvent.detail === "report") {
        setActiveTab("report");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    };

    window.addEventListener("cm-budget-nav", handler);
    return () => {
      window.removeEventListener("cm-budget-nav", handler);
    };
  }, []);

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
  const sectionRows = budgetWithSharedBreakdown.rows.filter((r) => r.rowType === "section");
  const incomeSections = sectionRows.filter((r) => r.sectionType === "income");
  const expendSections = sectionRows.filter((r) => r.sectionType === "expenditure");
  const totalRows = budgetWithSharedBreakdown.rows.filter((r) => r.rowType === "total" || r.rowType === "net");
  const cashCards = [
    ...cashAtBankItems.slice(0, 3).map((item) => ({
      key: item.code,
      label: `${item.code} ${item.name}`,
      value: item.balance,
      isTotal: false,
    })),
    {
      key: "cash-total",
      label: "Total Cash at Bank",
      value: cashAtBankItems.reduce((sum, item) => sum + item.balance, 0),
      isTotal: true,
    },
  ];

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
      <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur border-b border-gray-200 dark:border-gray-700 -mx-4 sm:-mx-6 lg:-mx-8 mb-6 shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8 pt-3 pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Budget Report{budget.year ? ` ${budget.year}` : ""}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {fileName} · {budget.sheetName} · {budgetWithSharedBreakdown.rows.filter((r) => r.rowType === "item").length} line items
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                To update budget values, update the GitHub file app/config/sharedBudget.json.
              </p>
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
                <>
                  <button
                    onClick={() => onSaveAsSavedBudget(budget)}
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 bg-blue-600 text-white hover:bg-blue-700"
                  >
                    Save as Saved Budget
                  </button>
                  <button
                    onClick={hasSavedBudget && onClearSavedBudget ? onClearSavedBudget : onReset}
                    className="px-4 py-2 text-sm font-medium rounded-lg transition-colors shrink-0 border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-950"
                  >
                    {hasSavedBudget ? "Clear Saved Budget" : "Clear Data"}
                  </button>
                </>
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

      {cashAtBankItems.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {cashCards.map((card) => (
            <div
              key={card.key}
              className={`rounded-xl border p-4 ${card.isTotal ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800" : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700"}`}
            >
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide leading-tight min-h-[2rem]">{card.label}</p>
              <p className={`text-2xl font-bold mt-2 ${card.isTotal ? "text-emerald-700 dark:text-emerald-300" : "text-gray-900 dark:text-white"}`}>£{fmtCash(card.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tab selector ──────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex gap-1">
          {(["dashboard", "report"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={tab === "dashboard" ? goToDashboard : goToReport}
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
            <BudgetDashboard budget={budgetWithSharedBreakdown} />
          </div>
        </section>
      )}

      {/* ── REPORT TABLE tab ──────────────────────────────────────────────── */}
      {activeTab === "report" && (
        <section id="budget-report-section">
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
              budget={budgetWithSharedBreakdown}
              expandedSections={expandedSections}
              expandedSubsections={expandedSubsections}
              onToggleSection={toggleSection}
              onToggleSubsection={toggleSubsection}
              editable={isSavedBudget && editMode}
              onRowTextChange={handleRowTextChange}
              onRowValueChange={handleRowValueChange}
              stickyTop="0"
            />
          </div>

          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-900">
            {cashAtBankItems.length > 0 && (
              <div className="mb-6 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Code</th>
                      <th className="text-left px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Account</th>
                      <th className="text-right px-3 py-2 font-semibold text-gray-700 dark:text-gray-300">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashAtBankItems.map((item, idx) => (
                      <tr key={`${item.code}-${item.name}-${idx}`} className="border-b border-gray-100 dark:border-gray-800">
                        <td className="px-3 py-2 text-gray-900 dark:text-white font-mono">{item.code}</td>
                        <td className="px-3 py-2 text-gray-900 dark:text-white">{item.name}</td>
                        <td className="px-3 py-2 text-right font-semibold text-gray-900 dark:text-white">£{fmtCash(item.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                      <td colSpan={2} className="px-3 py-3 font-bold text-gray-900 dark:text-white">Total Cash at Bank (Uploaded)</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900 dark:text-white">
                        £{fmtCash(cashAtBankItems.reduce((sum, item) => sum + item.balance, 0))}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            <div
              onDragEnter={(e) => {
                e.preventDefault();
                setCashDropActive(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setCashDropActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setCashDropActive(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setCashDropActive(false);
                const droppedFile = e.dataTransfer.files?.[0];
                if (droppedFile) {
                  await handleCashFileUpload(droppedFile);
                }
              }}
              onClick={() => cashFileInputRef.current?.click()}
              className={`mx-auto w-full max-w-2xl rounded-3xl border-2 border-dashed p-8 text-center transition cursor-pointer ${
                cashDropActive
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/40"
                  : "border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-900"
              }`}
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-100 text-3xl text-blue-600 dark:bg-blue-900 dark:text-blue-300">
                📄
              </div>
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white">Drop your cash in bank document here</h3>
              <p className="mt-2 text-lg text-gray-600 dark:text-gray-400">or click to browse</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  cashFileInputRef.current?.click();
                }}
                disabled={cashUploadLoading}
                className="mt-5 rounded-xl bg-blue-600 px-6 py-3 text-lg font-semibold text-white hover:bg-blue-700 disabled:bg-gray-400"
              >
                {cashUploadLoading ? "Adding..." : "Choose File"}
              </button>
              <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Supports .xlsx, .xls, and .pdf files</p>
            </div>
            <input
              ref={cashFileInputRef}
              type="file"
              accept=".xlsx,.xls,.pdf"
              className="hidden"
              onChange={async (e) => {
                const selectedFile = e.target.files?.[0];
                if (selectedFile) {
                  await handleCashFileUpload(selectedFile);
                }
                e.currentTarget.value = "";
              }}
            />
          </div>
        </section>
      )}
    </div>
  );
}
