import * as XLSX from "xlsx";
import type { Transaction, ColumnMapping } from "../types";

// ---------------------------------------------------------------------------
// Row-level junk filter
// These patterns appear in bank exports as metadata/summary rows, not real
// transactions. All matching is case-insensitive.
// ---------------------------------------------------------------------------
const JUNK_ROW_PATTERNS = [
  /^\s*totals?\s*$/i,
  /^\s*history\s+balance\s*$/i,
  /^\s*account\s+balance\s*$/i,
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
// ---------------------------------------------------------------------------
function parseAmount(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[£€$,\s]/g, "");
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function parseExcelFile(
  file: File
): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        // cellDates: true – xlsx converts serial dates to JS Date objects
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
          new Error(
            "Failed to parse the Excel file. Please ensure it is a valid .xlsx file."
          )
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

