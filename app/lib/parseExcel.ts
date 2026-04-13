import * as XLSX from "@e965/xlsx";
import type { Transaction, ColumnMapping, WorkbookMeta, SectionBalance } from "../types";

// ---------------------------------------------------------------------------
// Row-level junk filter
// These patterns appear in bank exports as metadata/summary rows, not real
// transactions. All matching is case-insensitive.
// ---------------------------------------------------------------------------
const JUNK_ROW_PATTERNS = [
  /^\s*totals?\s*$/i,
  /^\s*history\s+balance\s*:?\s*$/i,
  /^\s*account\s+balance\s*:?\s*$/i,
  /^\s*opening\s+balance\s*$/i,
  /^\s*closing\s+balance\s*$/i,
  /^\s*n\/c\s*:/i,
  /^\s*name\s*:/i,
  /^\s*ref\s*:/i,
  /^\s*statement\s+(from|period|date)/i,
];

function isJunkRow(row: Record<string, unknown>): boolean {
  const values = Object.values(row).map((v) => String(v ?? "").trim());
  // A row is "junk" when any cell matches a junk pattern
  return values.some((v) => JUNK_ROW_PATTERNS.some((re) => re.test(v)));
}

// ---------------------------------------------------------------------------
// Date parsing – supports:
//   • DD/MM/YYYY  (preferred per requirement)
//   • YYYY-MM-DD
//   • MM/DD/YYYY  (US bank exports)
//   • JavaScript Date objects produced by xlsx cellDates option
//   • Excel serial numbers
// Returns "YYYY-MM-DD" or "" when unrecognisable.
// ---------------------------------------------------------------------------
function parseDateString(raw: unknown): string {
  if (!raw && raw !== 0) return "";

  // Already a Date (xlsx cellDates: true)
  if (raw instanceof Date) {
    if (isNaN(raw.getTime())) return "";
    return raw.toISOString().slice(0, 10);
  }

  // Excel serial number
  if (typeof raw === "number") {
    const parts = XLSX.SSF.parse_date_code(raw);
    if (parts) {
      const y = parts.y;
      const m = String(parts.m).padStart(2, "0");
      const d = String(parts.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    return "";
  }

  const s = String(raw).trim();
  if (!s) return "";

  // DD/MM/YYYY (primary format per requirement)
  const ddmmyyyy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy] = ddmmyyyy;
    const day = dd.padStart(2, "0");
    const month = mm.padStart(2, "0");
    // Validate: day 1-31, month 1-12
    if (parseInt(mm, 10) >= 1 && parseInt(mm, 10) <= 12 && parseInt(dd, 10) >= 1 && parseInt(dd, 10) <= 31) {
      return `${yyyy}-${month}-${day}`;
    }
  }

  // YYYY-MM-DD (ISO)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return s;

  // Attempt via Date constructor as last resort (may give wrong MM/DD interpretation)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return d.toISOString().slice(0, 10);
  }

  // Unrecognisable – return empty so the row isn't grouped into a phantom month
  return "";
}

// ---------------------------------------------------------------------------
// Parse a monetary value from a cell, stripping currency symbols and commas.
// Supports accounting-style parenthesis negatives: (7,035) → -7035
// ---------------------------------------------------------------------------
function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const s = raw.trim();
    // Accounting negative: (7,035) or (£7,035.50)
    const parenMatch = s.match(/^\(([0-9,.\s£€$]+)\)$/);
    if (parenMatch) {
      const n = parseFloat(parenMatch[1].replace(/[,\s£€$]/g, ""));
      return isNaN(n) ? 0 : -n;
    }
    const cleaned = s.replace(/[£€$,\s]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Read the workbook from a File and return all sheet names + a raw buffer.
 * The buffer can be passed to parseTransactionSheet / isBudgetSheet / parseBudgetSheet
 * without re-reading the file.
 */
export function readWorkbook(file: File): Promise<WorkbookMeta> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const data = new Uint8Array(buffer);
        const workbook = XLSX.read(data, { type: "array" });
        resolve({ sheetNames: workbook.SheetNames, buffer });
      } catch {
        reject(new Error("Failed to read the Excel file. Please ensure it is a valid .xlsx file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read the file."));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Parse one sheet from an already-read buffer as a flat list of rows
 * (used by the transaction column-mapping flow).
 */
export function parseTransactionSheet(
  buffer: ArrayBuffer,
  sheetName: string
): { headers: string[]; rows: Record<string, unknown>[] } {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    raw: false,
    defval: "",
  });
  if (jsonData.length === 0) throw new Error("The selected sheet appears to be empty.");
  return { headers: Object.keys(jsonData[0]), rows: jsonData };
}

/** @deprecated Use readWorkbook + parseTransactionSheet instead. */
export function parseExcelFile(
  file: File
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
          raw: false,
          defval: "",
        });
        if (jsonData.length === 0) {
          reject(new Error("The spreadsheet appears to be empty."));
          return;
        }
        const headers = Object.keys(jsonData[0]);
        resolve({ headers, rows: jsonData });
      } catch {
        reject(
          new Error("Failed to parse the Excel file. Please ensure it is a valid .xlsx file.")
        );
      }
    };
    reader.onerror = () => reject(new Error("Failed to read the file."));
    reader.readAsArrayBuffer(file);
  });
}

/** Auto-detect likely column mappings from spreadsheet headers. */
export function detectMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lower = headers.map((h) => h.toLowerCase().trim());

  const find = (candidates: string[]): string | undefined => {
    for (const c of candidates) {
      const idx = lower.findIndex((h) => h.includes(c));
      if (idx !== -1) return headers[idx];
    }
    return undefined;
  };

  mapping.date = find(["date", "transaction date", "posted date", "value date"]);
  mapping.description = find(["description", "memo", "payee", "merchant", "details", "particulars"]);
  mapping.category = find(["category", "subcategory", "type", "group"]);
  mapping.account = find(["account", "bank", "card", "wallet"]);

  // Prefer explicit debit/credit columns over a single amount column
  const debitCol = find(["debit", "withdrawals", "withdrawal", "out"]);
  const creditCol = find(["credit", "deposits", "deposit", "in"]);

  if (debitCol && creditCol) {
    mapping.debit = debitCol;
    mapping.credit = creditCol;
    mapping.amount = ""; // will be derived
  } else {
    mapping.amount = find(["amount", "value", "sum", "total"]) ?? debitCol ?? creditCol ?? "";
  }

  return mapping;
}

/** Map parsed rows to Transaction objects, applying all filters. */
export function mapRows(
  rows: Record<string, unknown>[],
  mapping: ColumnMapping
): Transaction[] {
  const useDebitCredit = !!(mapping.debit && mapping.credit);

  return rows
    .filter((row) => !isJunkRow(row))
    .map((row) => {
      // Amount resolution
      let amount: number;
      if (useDebitCredit) {
        const debit = parseAmount(row[mapping.debit!]);
        const credit = parseAmount(row[mapping.credit!]);
        // credit = money in (positive), debit = money out (negative)
        amount = credit - debit;
      } else {
        amount = parseAmount(row[mapping.amount]);
      }

      const dateStr = parseDateString(row[mapping.date]);

      return {
        date: dateStr,
        description: String(row[mapping.description] ?? "").trim(),
        category:
          String(row[mapping.category] ?? "").trim() || "Uncategorized",
        account:
          String(row[mapping.account] ?? "").trim() || "Unknown",
        amount,
      } as Transaction;
    })
    .filter((t) => {
      // Drop rows with no amount info and no recognisable date
      return t.amount !== 0 || t.date !== "";
    });
}

// ---------------------------------------------------------------------------
// Multi-section bank export support
// ---------------------------------------------------------------------------

/**
 * Scan all raw cells in a row (excluding the first label cell) for the first
 * value that looks like a number, including accounting-style "(7,035)" negatives.
 * Returns null if no numeric value is found.
 */
function findNumericInRow(row: unknown[]): number | null {
  for (let i = 1; i < row.length; i++) {
    const val = row[i];
    if (typeof val === "number" && !isNaN(val)) return val;
    if (typeof val === "string") {
      const s = val.trim();
      if (s === "") continue;
      // Only attempt parse when the cell looks like a number
      if (/^[\-+]?[\d,£€$\s]*\.?\d+$/.test(s) || /^\([0-9,.\s£€$]+\)$/.test(s)) {
        return parseAmount(s);
      }
    }
  }
  return null;
}

/**
 * Return true when the raw row looks like a transaction column-header row,
 * i.e. it contains a cell equal to "date" and at least one of
 * "debit" / "credit" / "value" / "amount".
 */
function isTransactionHeaderRow(row: unknown[]): boolean {
  const cells = row.map((c) => String(c ?? "").toLowerCase().trim());
  const hasDate = cells.includes("date");
  const hasAmount =
    cells.includes("debit") ||
    cells.includes("credit") ||
    cells.includes("value") ||
    cells.includes("amount");
  return hasDate && hasAmount;
}

/** Find the index of the first column whose header matches one of the candidates. */
function findColIdx(headerRow: string[], candidates: string[]): number {
  const lower = headerRow.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c);
    if (idx !== -1) return idx;
  }
  return -1;
}

/**
 * Detect whether a sheet uses the multi-section bank-export layout where
 * each section begins with an "N/C:" metadata row.
 */
export function isMultiSectionFormat(buffer: ArrayBuffer, sheetName: string): boolean {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array" });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return false;

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  for (const row of rawRows.slice(0, 30)) {
    if (!Array.isArray(row) || row.length === 0) continue;
    const firstCell = String(row[0] ?? "").trim();
    if (/^n\/c\s*:?$/i.test(firstCell)) {
      return true;
    }
  }
  return false;
}

/**
 * Parse a multi-section bank export sheet.
 *
 * Each section begins with "N/C:" and "Name:" metadata rows, is followed by
 * a transaction header row and transaction data rows, and ends with
 * "Totals:" / "History Balance:" / optional "Account Balance:" summary rows.
 *
 * Returns all transactions (with `category` set to the enclosing section name)
 * and a list of per-section history balances.
 */
export function parseMultiSectionSheet(
  buffer: ArrayBuffer,
  sheetName: string
): { transactions: Transaction[]; sectionBalances: SectionBalance[] } {
  const data = new Uint8Array(buffer);
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found.`);

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });

  const transactions: Transaction[] = [];
  const sectionBalances: SectionBalance[] = [];

  // Current section context
  let currentCode = "";
  let currentName = "";
  let currentHistoryBalance: number | null = null;
  let currentAccountBalance: number | null = null;

  // Current header column indices
  let dateIdx = -1;
  let detailsIdx = -1;
  let debitIdx = -1;
  let creditIdx = -1;
  let valueIdx = -1;
  let accountIdx = -1;

  const finaliseSection = () => {
    if (currentName && currentHistoryBalance !== null) {
      sectionBalances.push({
        sectionCode: currentCode,
        sectionName: currentName,
        historyBalance: currentHistoryBalance,
        accountBalance: currentAccountBalance ?? undefined,
      });
    }
    currentHistoryBalance = null;
    currentAccountBalance = null;
  };

  for (const rawRow of rawRows) {
    if (!Array.isArray(rawRow)) continue;

    const firstCell = String(rawRow[0] ?? "").trim();

    // ── Metadata: N/C: ─────────────────────────────────────────────────────
    if (/^n\/c\s*:?$/i.test(firstCell)) {
      currentCode = String(rawRow[1] ?? "").trim();
      continue;
    }

    // ── Metadata: Name: ────────────────────────────────────────────────────
    if (/^name\s*:?$/i.test(firstCell)) {
      finaliseSection();
      currentName = String(rawRow[1] ?? "").trim();
      // Reset header so we pick it up fresh for this section
      dateIdx = detailsIdx = debitIdx = creditIdx = valueIdx = accountIdx = -1;
      continue;
    }

    // ── Summary: History Balance ────────────────────────────────────────────
    if (/^history\s+balance\s*:?$/i.test(firstCell)) {
      const n = findNumericInRow(rawRow);
      if (n !== null) currentHistoryBalance = n;
      continue;
    }

    // ── Summary: Account Balance ────────────────────────────────────────────
    if (/^account\s+balance\s*:?$/i.test(firstCell)) {
      const n = findNumericInRow(rawRow);
      if (n !== null) currentAccountBalance = n;
      continue;
    }

    // ── Skip other known summary / junk rows ───────────────────────────────
    if (
      /^totals?\s*:?$/i.test(firstCell) ||
      /^opening\s+balance\s*:?$/i.test(firstCell) ||
      /^closing\s+balance\s*:?$/i.test(firstCell) ||
      /^statement\s+(from|period|date)/i.test(firstCell)
    ) {
      continue;
    }

    // ── Header row detection ───────────────────────────────────────────────
    if (isTransactionHeaderRow(rawRow)) {
      const headerRow = rawRow.map((c) => String(c ?? "").trim());
      dateIdx = findColIdx(headerRow, ["date"]);
      detailsIdx = findColIdx(headerRow, ["details", "description", "particulars", "memo", "narrative"]);
      debitIdx = findColIdx(headerRow, ["debit"]);
      creditIdx = findColIdx(headerRow, ["credit"]);
      valueIdx = findColIdx(headerRow, ["value"]);
      accountIdx = findColIdx(headerRow, ["account"]);
      continue;
    }

    // ── Transaction row ────────────────────────────────────────────────────
    if (dateIdx === -1) continue; // Haven't found a header row yet

    const rawDate = rawRow[dateIdx];
    const dateStr = parseDateString(rawDate);
    if (!dateStr) continue; // Skip rows without a valid date

    let amount = 0;
    if (debitIdx !== -1 && creditIdx !== -1) {
      const debit = parseAmount(rawRow[debitIdx]);
      const credit = parseAmount(rawRow[creditIdx]);
      amount = credit - debit;
    } else if (valueIdx !== -1) {
      amount = parseAmount(rawRow[valueIdx]);
    }

    const description =
      detailsIdx !== -1 ? String(rawRow[detailsIdx] ?? "").trim() : "";
    const account =
      accountIdx !== -1 ? String(rawRow[accountIdx] ?? "").trim() : "";

    if (amount !== 0 || dateStr !== "") {
      transactions.push({
        date: dateStr,
        description: description || "Unknown",
        category: currentName || "Uncategorized",
        account: account || currentCode || "Unknown",
        amount,
      });
    }
  }

  // Finalise the last section
  finaliseSection();

  return { transactions, sectionBalances };
}

