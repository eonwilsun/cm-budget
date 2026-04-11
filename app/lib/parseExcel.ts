import * as XLSX from "xlsx";
import type { Transaction, ColumnMapping } from "../types";

export function parseExcelFile(file: File): Promise<{ headers: string[]; rows: Record<string, unknown>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array", cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { raw: false, defval: "" });

        if (jsonData.length === 0) {
          reject(new Error("The spreadsheet appears to be empty."));
          return;
        }

        const headers = Object.keys(jsonData[0]);
        resolve({ headers, rows: jsonData });
      } catch {
        reject(new Error("Failed to parse the Excel file. Please ensure it is a valid .xlsx file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read the file."));
    reader.readAsArrayBuffer(file);
  });
}

export function detectMapping(headers: string[]): Partial<ColumnMapping> {
  const mapping: Partial<ColumnMapping> = {};
  const lowerHeaders = headers.map((h) => h.toLowerCase().trim());

  const find = (candidates: string[]): string | undefined => {
    for (const candidate of candidates) {
      const idx = lowerHeaders.findIndex((h) => h.includes(candidate));
      if (idx !== -1) return headers[idx];
    }
    return undefined;
  };

  mapping.date = find(["date", "transaction date", "posted date", "time"]);
  mapping.description = find(["description", "memo", "payee", "merchant", "name"]);
  mapping.category = find(["category", "type", "subcategory", "group"]);
  mapping.account = find(["account", "bank", "card", "wallet"]);
  mapping.amount = find(["amount", "value", "total", "debit", "credit", "sum"]);

  return mapping;
}

export function mapRows(rows: Record<string, unknown>[], mapping: ColumnMapping): Transaction[] {
  return rows
    .map((row) => {
      const rawAmount = row[mapping.amount];
      let amount = 0;
      if (typeof rawAmount === "number") {
        amount = rawAmount;
      } else if (typeof rawAmount === "string") {
        const cleaned = rawAmount.replace(/[$,\s]/g, "");
        amount = parseFloat(cleaned);
        if (isNaN(amount)) amount = 0;
      }

      const rawDate = row[mapping.date];
      let dateStr = "";
      if (rawDate instanceof Date) {
        dateStr = rawDate.toISOString().slice(0, 10);
      } else if (typeof rawDate === "string") {
        dateStr = rawDate.trim();
      } else if (typeof rawDate === "number") {
        // Excel serial date
        const jsDate = XLSX.SSF.parse_date_code(rawDate);
        if (jsDate) {
          const y = jsDate.y;
          const m = String(jsDate.m).padStart(2, "0");
          const d = String(jsDate.d).padStart(2, "0");
          dateStr = `${y}-${m}-${d}`;
        }
      }

      return {
        date: dateStr,
        description: String(row[mapping.description] ?? "").trim(),
        category: String(row[mapping.category] ?? "Uncategorized").trim() || "Uncategorized",
        account: String(row[mapping.account] ?? "Unknown").trim() || "Unknown",
        amount,
      } as Transaction;
    })
    .filter((t) => !isNaN(t.amount));
}
