/**
 * Budget-report sheet parser.
 *
 * Handles spreadsheets with the layout:
 *   Code | Name/Notes | Budget {year} | Jan | Feb | … | Dec | Total
 *
 * Rows are categorised as: section / subsection / item / total / net.
 * Month columns are detected flexibly: full names, abbreviations, numeric
 * months, or Excel date cells.
 * Accounting-style parenthesis negatives like (7,035) are converted to -7035.
 */
import * as XLSX from "@e965/xlsx";
import type {
  ParsedBudget,
  BudgetColumn,
  BudgetRow,
  SectionType,
  BudgetRowType,
} from "../types";

// ---------------------------------------------------------------------------
// Month detection helpers
// ---------------------------------------------------------------------------
const MONTH_NAME_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, sept: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};
// Add "1"–"12" and "01"–"12"
for (let i = 1; i <= 12; i++) {
  MONTH_NAME_MAP[String(i)] = i - 1;
  MONTH_NAME_MAP[String(i).padStart(2, "0")] = i - 1;
}

function monthFromValue(v: unknown): number | null {
  // JS Date object (xlsx cellDates: true)
  if (v instanceof Date && !isNaN(v.getTime())) return v.getMonth();
  // Excel serial number
  if (typeof v === "number" && v > 0 && Number.isInteger(v) && v <= 2958465) {
    try {
      const p = XLSX.SSF.parse_date_code(v);
      if (p && p.m >= 1 && p.m <= 12) return p.m - 1;
    } catch { /* not a date serial */ }
    if (v >= 1 && v <= 12) return v - 1;
  }
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    // Strip trailing year/suffix: "jan-24", "jan 2024", "jan24"
    const stripped = s.replace(/[-/\s]?\d{2,4}$/, "").trim();
    if (MONTH_NAME_MAP[stripped] !== undefined) return MONTH_NAME_MAP[stripped];
    if (MONTH_NAME_MAP[s] !== undefined) return MONTH_NAME_MAP[s];
  }
  return null;
}

function labelFor(v: unknown): string {
  if (v instanceof Date && !isNaN(v.getTime())) {
    return v.toLocaleString("default", { month: "short", year: "2-digit" });
  }
  return String(v ?? "").trim();
}

// ---------------------------------------------------------------------------
// Number parsing – handles accounting parenthesis negatives
// ---------------------------------------------------------------------------
function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return isFinite(v) ? v : null;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "" || s === "-" || s === "–") return null;
    // Accounting negative: (7,035) or (£7,035.50)
    const paren = s.match(/^\(([0-9,.\s£€$]+)\)$/);
    if (paren) {
      const n = parseFloat(paren[1].replace(/[,\s£€$]/g, ""));
      return isNaN(n) ? null : -n;
    }
    const cleaned = s.replace(/[£€$,\s%]/g, "");
    if (cleaned === "" || cleaned === "-") return null;
    const n = parseFloat(cleaned);
    return isNaN(n) ? null : n;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Section-type detection
// ---------------------------------------------------------------------------
const INCOME_KW = ["income", "revenue", "receipts", "funding", "grants", "inflow"];
const EXPEND_KW = ["expenditure", "expenses", "costs", "spending", "outgoings", "payments", "disbursement"];

function detectSectionType(text: string): SectionType {
  const l = text.toLowerCase();
  if (INCOME_KW.some((k) => l.includes(k))) return "income";
  if (EXPEND_KW.some((k) => l.includes(k))) return "expenditure";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Public: detect whether this sheet looks like a budget report
// ---------------------------------------------------------------------------
export function isBudgetSheet(buffer: ArrayBuffer, sheetName: string): boolean {
  try {
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return false;
    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });

    let monthCount = 0;
    let hasSectionKeyword = false;
    let hasBudgetHeader = false;
    let hasNameHeader = false;
    for (let i = 0; i < Math.min(raw.length, 40); i++) {
      const row = (raw[i] as unknown[]) ?? [];
      for (const cell of row) {
        if (monthFromValue(cell) !== null) monthCount++;
        const s = String(cell ?? "").toLowerCase().trim();
        if ([...INCOME_KW, ...EXPEND_KW].some((k) => s.includes(k))) {
          hasSectionKeyword = true;
        }
        if (/^budget/.test(s) || s === "annual" || s === "full year") {
          hasBudgetHeader = true;
        }
        if (["code", "name", "description", "details", "item", "narrative", "heading", "notes"].includes(s)) {
          hasNameHeader = true;
        }
      }
    }
    return monthCount >= 3 && (hasBudgetHeader || hasSectionKeyword || hasNameHeader);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public: parse a budget-format sheet into a ParsedBudget
// ---------------------------------------------------------------------------
export function parseBudgetSheet(
  buffer: ArrayBuffer,
  sheetName: string
): ParsedBudget | null {
  try {
    const wb = XLSX.read(new Uint8Array(buffer), { type: "array", cellDates: true });
    const sheet = wb.Sheets[sheetName];
    if (!sheet) return null;

    const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
    });
    if (raw.length === 0) return null;

    // -----------------------------------------------------------------------
    // 1. Find the header row
    // -----------------------------------------------------------------------
    let headerRowIdx = -1;
    for (let i = 0; i < Math.min(raw.length, 25); i++) {
      const row = (raw[i] as unknown[]) ?? [];
      let months = 0;
      let hasBudget = false;
      let hasName = false;
      for (const cell of row) {
        if (monthFromValue(cell) !== null) months++;
        const s = String(cell ?? "").toLowerCase().trim();
        if (/^budget/.test(s) || s === "annual" || s === "full year") hasBudget = true;
        if (["code", "name", "description", "details", "item", "narrative", "heading", "notes"].includes(s))
          hasName = true;
      }
      if ((months >= 2 || hasBudget) && hasName) { headerRowIdx = i; break; }
    }
    // Fallback: first row with ≥3 month-like headers
    if (headerRowIdx === -1) {
      for (let i = 0; i < Math.min(raw.length, 25); i++) {
        const row = (raw[i] as unknown[]) ?? [];
        if (row.filter((c) => monthFromValue(c) !== null).length >= 3) {
          headerRowIdx = i; break;
        }
      }
    }
    if (headerRowIdx === -1) return null;

    // -----------------------------------------------------------------------
    // 2. Build BudgetColumn[] from the header row
    // -----------------------------------------------------------------------
    const headerRow = (raw[headerRowIdx] as unknown[]) ?? [];
    const columns: BudgetColumn[] = [];
    let codeColIdx = -1;
    let nameColIdx = -1;
    let notesColIdx = -1;
    let budgetYear: number | null = null;

    const codeKw = new Set(["code", "a/c", "ac", "ref", "no", "#", "id"]);
    const nameKw = new Set(["name", "description", "details", "item", "narrative", "heading"]);
    const notesKw = new Set(["notes", "note", "comments", "comment", "remarks"]);
    const totalKw = new Set(["total", "ytd", "full year", "annual", "sum", "year total"]);

    for (let colIndex = 0; colIndex < headerRow.length; colIndex++) {
      const cell = headerRow[colIndex];
      if (cell === null || cell === undefined) continue;
      const rawLabel = labelFor(cell);
      const lower = rawLabel.toLowerCase().trim();
      const key = `col_${colIndex}`;

      if (codeColIdx === -1 && codeKw.has(lower)) {
        codeColIdx = colIndex;
        columns.push({ key, label: rawLabel, monthIndex: null, isBudget: false, isTotal: false, colIndex: colIndex });
        continue;
      }
      if (nameColIdx === -1 && nameKw.has(lower)) {
        nameColIdx = colIndex;
        columns.push({ key, label: rawLabel, monthIndex: null, isBudget: false, isTotal: false, colIndex: colIndex });
        continue;
      }
      if (notesColIdx === -1 && notesKw.has(lower)) {
        notesColIdx = colIndex;
        columns.push({ key, label: rawLabel, monthIndex: null, isBudget: false, isTotal: false, colIndex: colIndex });
        continue;
      }
      // Budget year column
      const bm = lower.match(/budget\s*(\d{4})?/);
      if (bm) {
        if (bm[1]) budgetYear = parseInt(bm[1]);
        columns.push({ key, label: rawLabel, monthIndex: null, isBudget: true, isTotal: false, colIndex: colIndex });
        continue;
      }
      // Total column
      if (totalKw.has(lower)) {
        columns.push({ key, label: rawLabel, monthIndex: null, isBudget: false, isTotal: true, colIndex: colIndex });
        continue;
      }
      // Month column (string or Date header)
      const mi = monthFromValue(cell);
      if (mi !== null) {
        columns.push({ key, label: rawLabel, monthIndex: mi, isBudget: false, isTotal: false, colIndex: colIndex });
        continue;
      }
      // Keep unknown non-empty columns (they may hold data)
      if (rawLabel) {
        columns.push({ key, label: rawLabel, monthIndex: null, isBudget: false, isTotal: false, colIndex: colIndex });
      }
    }

    // Positional fallback if keywords weren't found
    const nonDataCols = columns.filter((c) => c.monthIndex === null && !c.isBudget && !c.isTotal);
    if (codeColIdx === -1 && nonDataCols.length >= 1) codeColIdx = nonDataCols[0].colIndex;
    if (nameColIdx === -1 && nonDataCols.length >= 2) nameColIdx = nonDataCols[1].colIndex;
    else if (nameColIdx === -1 && nonDataCols.length >= 1 && nonDataCols[0].colIndex !== codeColIdx)
      nameColIdx = nonDataCols[0].colIndex;

    const dataCols = columns.filter((c) => c.monthIndex !== null || c.isBudget || c.isTotal);
    const dataColIndices = dataCols.map((c) => c.colIndex);

    // -----------------------------------------------------------------------
    // 3. Parse data rows
    // -----------------------------------------------------------------------
    const budgetRows: BudgetRow[] = [];
    let currentSection = "";
    let currentSectionType: SectionType = "unknown";
    let currentSubsection = "";

    for (let ri = headerRowIdx + 1; ri < raw.length; ri++) {
      const row = (raw[ri] as unknown[]) ?? [];
      const allEmpty = row.every((v) => v === null || v === undefined || String(v).trim() === "");
      if (allEmpty) continue;

      const codeVal = codeColIdx >= 0 ? String(row[codeColIdx] ?? "").trim() : "";
      const nameVal = nameColIdx >= 0 ? String(row[nameColIdx] ?? "").trim() : "";
      const notesVal = notesColIdx >= 0 ? String(row[notesColIdx] ?? "").trim() : "";

      // Collect numeric values for data columns
      const values: Record<string, number | null> = {};
      for (const col of dataCols) {
        values[col.key] = col.colIndex < row.length ? parseNum(row[col.colIndex]) : null;
      }
      const hasNumericData = dataColIndices.some(
        (idx) => idx < row.length && parseNum(row[idx]) !== null
      );

      const nameUpper = nameVal.toUpperCase();
      const looksAllCaps = nameVal.length > 2 && nameVal === nameUpper && /[A-Z]/.test(nameVal);
      const isTotal =
        /\btotal(s)?\b/i.test(nameVal) ||
        /\bsub[-\s]?total\b/i.test(nameVal) ||
        /\btotal(s)?\b/i.test(codeVal);
      const isNet = /\bnet\b/i.test(nameVal) && !hasNumericData;

      let rowType: BudgetRowType;

      if (!hasNumericData && (looksAllCaps || detectSectionType(nameVal) !== "unknown")) {
        rowType = "section";
        currentSection = nameVal;
        currentSectionType = detectSectionType(nameVal);
        currentSubsection = "";
      } else if (isNet) {
        rowType = "net";
      } else if (isTotal) {
        rowType = "total";
        currentSubsection = "";
      } else if (!codeVal && !hasNumericData && nameVal) {
        rowType = "subsection";
        currentSubsection = nameVal;
      } else if (nameVal || codeVal) {
        rowType = "item";
      } else {
        continue; // skip truly blank rows
      }

      const indent =
        rowType === "section" ? 0
        : rowType === "subsection" ? 1
        : rowType === "total" || rowType === "net" ? 0
        : 2;

      budgetRows.push({
        code: codeVal,
        name: nameVal,
        notes: notesVal,
        values,
        rowType,
        sectionName: currentSection,
        sectionType: currentSectionType,
        subsectionName: rowType === "item" ? currentSubsection : "",
        indent,
      });
    }

    return { year: budgetYear, columns, rows: budgetRows, sheetName };
  } catch (err) {
    console.error("Budget parse error:", err);
    return null;
  }
}
