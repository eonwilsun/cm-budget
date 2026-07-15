"use client";

import React, { forwardRef } from "react";
import type { ParsedBudget, BudgetRow, BudgetColumn } from "../types";

interface BudgetTableProps {
  budget: ParsedBudget;
  expandedSections: Set<string>;
  expandedSubsections: Set<string>;
  onToggleSection: (name: string) => void;
  onToggleSubsection: (sectionName: string, subsName: string) => void;
  editable?: boolean;
  onRowTextChange?: (rowIndex: number, field: "code" | "name" | "notes", value: string) => void;
  onRowValueChange?: (rowIndex: number, columnKey: string, value: number | null) => void;
  stickyTop?: string;
}

const SECTION_BG: Record<string, string> = {
  income:       "bg-blue-700 dark:bg-blue-800 text-white",
  expenditure:  "bg-red-700  dark:bg-red-800  text-white",
  unknown:      "bg-gray-700 dark:bg-gray-600 text-white",
};
const SUBSECTION_BG = "bg-sky-100 dark:bg-sky-900/50 text-sky-900 dark:text-sky-100";
const TOTAL_BG      = "bg-gray-200 dark:bg-gray-600 text-gray-900 dark:text-gray-50 font-semibold";
const NET_BG        = "bg-gray-900 dark:bg-gray-950 text-white font-bold";

function fmt(n: number | null): string {
  if (n === null) return "";
  if (n === 0) return "–";
  // Accounting format: negatives in parentheses
  const abs = Math.abs(n);
  const s = new Intl.NumberFormat("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(abs);
  return n < 0 ? `(${s})` : s;
}

function numClass(n: number | null) {
  if (n === null || n === 0) return "text-gray-400 dark:text-gray-500";
  return n < 0 ? "text-red-600 dark:text-red-400" : "";
}

// Derive a scroll-target id from a section name
export function sectionAnchorId(name: string) {
  return `budget-section-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

const BudgetTable = forwardRef<HTMLDivElement, BudgetTableProps>(
  ({ budget, expandedSections, expandedSubsections, onToggleSection, onToggleSubsection, editable = false, onRowTextChange, onRowValueChange, stickyTop = "12rem" }, ref) => {
    const valueCols: BudgetColumn[] = budget.columns.filter(
      (c) => c.isBudget || c.monthIndex !== null || c.isTotal
    );

    function isVisible(row: BudgetRow): boolean {
      if (row.rowType === "section" || row.rowType === "net") return true;
      if (!expandedSections.has(row.sectionName)) return false;
      if (row.rowType === "subsection" || row.rowType === "total") return true;
      // item
      if (!row.subsectionName) return true;
      return expandedSubsections.has(`${row.sectionName}::${row.subsectionName}`);
    }

    // Code column width (px) — used for the sticky second column's left offset
    const codeW = 72;
    const nameW = 220;

    return (
      <div ref={ref} className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
        <table className="min-w-full text-xs border-collapse" style={{ minWidth: `${codeW + nameW + valueCols.length * 90}px` }}>
          {/* ── HEADER ───────────────────────────────────────────────────── */}
          <thead className="sticky z-20" style={{ top: stickyTop }}>
            <tr className="bg-gray-800 dark:bg-gray-900 text-white">
              {/* Sticky Code column */}
              <th
                className="text-left font-semibold px-2 py-2 border-r border-gray-600 whitespace-nowrap bg-gray-800 dark:bg-gray-900"
                style={{ position: "sticky", left: 0, width: codeW, minWidth: codeW, zIndex: 22 }}
              >
                Code
              </th>
              {/* Sticky Name column */}
              <th
                className="text-left font-semibold px-3 py-2 border-r border-gray-600 whitespace-nowrap bg-gray-800 dark:bg-gray-900"
                style={{ position: "sticky", left: codeW, width: nameW, minWidth: nameW, zIndex: 22 }}
              >
                Name
              </th>
              {/* Scrollable value columns */}
              {valueCols.map((col) => (
                <th
                  key={col.key}
                  className={`text-right font-semibold px-2 py-2 whitespace-nowrap border-l border-gray-600 ${
                    col.isBudget ? "bg-blue-900 dark:bg-blue-950" : col.isTotal ? "bg-gray-700 dark:bg-gray-800" : ""
                  }`}
                  style={{ minWidth: 88 }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>

          {/* ── BODY ─────────────────────────────────────────────────────── */}
          <tbody>
            {budget.rows.map((row, idx) => {
              if (!isVisible(row)) return null;

              // ── SECTION header ──
              if (row.rowType === "section") {
                const anchorId = sectionAnchorId(row.name);
                const sectionExpanded = expandedSections.has(row.sectionName || row.name);
                const bg = SECTION_BG[row.sectionType] ?? SECTION_BG.unknown;
                return (
                  <tr key={idx} id={anchorId} className={`${bg} cursor-pointer select-none`}
                    onClick={() => onToggleSection(row.sectionName || row.name)}>
                    <td
                      className={`px-2 py-2 font-bold ${bg}`}
                      style={{ position: "sticky", left: 0, zIndex: 10, width: codeW }}
                    >
                      {sectionExpanded ? "▾" : "▸"}
                    </td>
                    <td
                      className={`px-3 py-2 font-bold uppercase tracking-wide ${bg}`}
                      style={{ position: "sticky", left: codeW, zIndex: 10 }}
                      colSpan={1}
                    >
                      {row.name}
                    </td>
                    {valueCols.map((col) => (
                      <td key={col.key} className={`px-2 py-2 text-right font-semibold ${bg}`}>
                        {fmt(row.values[col.key] ?? null)}
                      </td>
                    ))}
                  </tr>
                );
              }

              // ── SUBSECTION header ──
              if (row.rowType === "subsection") {
                const subsKey = `${row.sectionName}::${row.name}`;
                const subsExpanded = expandedSubsections.has(subsKey);
                return (
                  <tr key={idx} className={`${SUBSECTION_BG} cursor-pointer select-none hover:bg-gray-200 dark:hover:bg-gray-600`}
                    onClick={() => onToggleSubsection(row.sectionName, row.name)}>
                    <td
                      className={`px-2 py-1.5 font-semibold ${SUBSECTION_BG}`}
                      style={{ position: "sticky", left: 0, zIndex: 10, width: codeW }}
                    >
                      {subsExpanded ? "▾" : "▸"}
                    </td>
                    <td
                      className={`px-3 py-1.5 font-semibold pl-6 ${SUBSECTION_BG}`}
                      style={{ position: "sticky", left: codeW, zIndex: 10 }}
                    >
                      {row.name}
                    </td>
                    {valueCols.map((col) => (
                      <td key={col.key} className={`px-2 py-1.5 text-right font-semibold ${numClass(row.values[col.key] ?? null)}`}>
                        {fmt(row.values[col.key] ?? null)}
                      </td>
                    ))}
                  </tr>
                );
              }

              // ── TOTAL row ──
              if (row.rowType === "total") {
                return (
                  <tr key={idx} className={TOTAL_BG}>
                    <td className={`px-2 py-1.5 ${TOTAL_BG}`} style={{ position: "sticky", left: 0, zIndex: 10, width: codeW }}>{row.code}</td>
                    <td className={`px-3 py-1.5 pl-4 ${TOTAL_BG}`} style={{ position: "sticky", left: codeW, zIndex: 10 }}>{row.name}</td>
                    {valueCols.map((col) => (
                      <td key={col.key} className={`px-2 py-1.5 text-right ${numClass(row.values[col.key] ?? null)}`}>
                        {fmt(row.values[col.key] ?? null)}
                      </td>
                    ))}
                  </tr>
                );
              }

              // ── NET row ──
              if (row.rowType === "net") {
                return (
                  <tr key={idx} className={NET_BG}>
                    <td className={`px-2 py-2 ${NET_BG}`} style={{ position: "sticky", left: 0, zIndex: 10, width: codeW }}>{row.code}</td>
                    <td className={`px-3 py-2 ${NET_BG}`} style={{ position: "sticky", left: codeW, zIndex: 10 }}>{row.name}</td>
                    {valueCols.map((col) => (
                      <td key={col.key} className={`px-2 py-2 text-right ${numClass(row.values[col.key] ?? null)}`}>
                        {fmt(row.values[col.key] ?? null)}
                      </td>
                    ))}
                  </tr>
                );
              }

              // ── ITEM row ──
              const isEven = idx % 2 === 0;
              return (
                <tr key={idx} className={isEven ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-850"}>
                  <td
                    className={`px-2 py-1 text-gray-500 dark:text-gray-400 ${isEven ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-850"}`}
                    style={{ position: "sticky", left: 0, zIndex: 10, width: codeW }}
                  >
                    {editable ? (
                      <input
                        type="text"
                        value={row.code}
                        onChange={(e) => onRowTextChange?.(idx, "code", e.target.value)}
                        className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-1.5 py-1 text-xs text-gray-700 dark:text-gray-200"
                      />
                    ) : (
                      row.code
                    )}
                  </td>
                  <td
                    className={`px-3 py-1 pl-10 text-gray-800 dark:text-gray-200 ${isEven ? "bg-white dark:bg-gray-900" : "bg-gray-50 dark:bg-gray-850"}`}
                    style={{ position: "sticky", left: codeW, zIndex: 10 }}
                  >
                    {editable ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => onRowTextChange?.(idx, "name", e.target.value)}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-xs text-gray-700 dark:text-gray-200"
                        />
                        <input
                          type="text"
                          value={row.notes}
                          placeholder="Notes"
                          onChange={(e) => onRowTextChange?.(idx, "notes", e.target.value)}
                          className="w-full rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-[11px] text-gray-500 dark:text-gray-400"
                        />
                      </div>
                    ) : (
                      <>
                        {row.name}
                        {row.notes && <span className="ml-2 text-gray-400 dark:text-gray-500 italic">{row.notes}</span>}
                      </>
                    )}
                  </td>
                  {valueCols.map((col) => {
                    const v = row.values[col.key] ?? null;
                    return (
                      <td
                        key={col.key}
                        className={`px-2 py-1 text-right tabular-nums ${numClass(v)} ${col.isBudget ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}
                      >
                        {editable ? (
                          <input
                            type="number"
                            step="0.01"
                            value={v ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              onRowValueChange?.(idx, col.key, raw === "" ? null : Number(raw));
                            }}
                            className="w-20 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-1.5 py-1 text-right text-xs text-gray-700 dark:text-gray-200"
                          />
                        ) : (
                          fmt(v)
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }
);

BudgetTable.displayName = "BudgetTable";
export default BudgetTable;
