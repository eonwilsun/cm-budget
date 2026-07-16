import type { BudgetColumn, BudgetRow, ParsedBudget, SectionType, Transaction } from "../types";
import { parseAmount, parseDateString } from "./parseExcel";
import { getPdfJs } from "./pdfText";

type NominalActivityEntry = {
  code: string;
  name: string;
  accountToken: string;
  date: string;
  amount: number;
};

function splitNominalName(name: string): { subsectionName: string; itemName: string } {
  const parts = name.split(":");
  if (parts.length < 2) {
    return { subsectionName: "", itemName: name.trim() };
  }

  const subsectionName = parts[0].trim();
  const itemName = parts.slice(1).join(":").trim();
  return {
    subsectionName,
    itemName: itemName || subsectionName,
  };
}

function classifySectionType(code: string): SectionType {
  const numericCode = parseInt(code.replace(/\D/g, ""), 10);
  if (!Number.isFinite(numericCode)) return "unknown";
  if (numericCode >= 4000 && numericCode < 5000) return "income";
  if (numericCode >= 5000) return "expenditure";
  return "unknown";
}

function monthLabel(date: Date): string {
  return date.toLocaleString("default", { month: "short" });
}

function buildColumns(months: Date[], year: number | null): BudgetColumn[] {
  const columns: BudgetColumn[] = [
    { key: "col_code", label: "Code", monthIndex: null, isBudget: false, isTotal: false, colIndex: 0 },
    { key: "col_name", label: "Name", monthIndex: null, isBudget: false, isTotal: false, colIndex: 1 },
    { key: "col_budget", label: year ? `Budget ${year}` : "Budget", monthIndex: null, isBudget: true, isTotal: false, colIndex: 2 },
  ];

  months.forEach((date, index) => {
    columns.push({
      key: `col_month_${index}`,
      label: monthLabel(date),
      monthIndex: date.getMonth(),
      isBudget: false,
      isTotal: false,
      colIndex: 3 + index,
    });
  });

  columns.push({
    key: "col_total",
    label: "Total",
    monthIndex: null,
    isBudget: false,
    isTotal: true,
    colIndex: 3 + months.length,
  });

  return columns;
}

function toNominalEntries(transactions: Transaction[]): NominalActivityEntry[] {
  return transactions
    .filter((transaction) => transaction.account && transaction.category && transaction.date)
    .map((transaction) => ({
      code: transaction.account,
      name: transaction.category,
      accountToken: transaction.description,
      date: transaction.date,
      amount: transaction.amount,
    }))
    .filter((entry) => entry.amount !== 0);
}

export function buildBudgetFromNominalTransactions(
  transactions: Transaction[],
  sheetName: string
): ParsedBudget {
  const entries = toNominalEntries(transactions);
  const monthDates = Array.from(
    new Map(
      entries.map((entry) => {
        const date = new Date(entry.date);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        return [key, new Date(date.getFullYear(), date.getMonth(), 1)] as const;
      })
    ).values()
  ).sort((a, b) => a.getTime() - b.getTime());

  const year = monthDates[0]?.getFullYear() ?? null;
  const columns = buildColumns(monthDates, year);
  const budgetRows: BudgetRow[] = [];
  const itemsByKey = new Map<string, BudgetRow>();
  const subsectionKeys = new Set<string>();
  const presentSections = new Set<SectionType>();

  for (const sectionType of ["income", "expenditure"] as const) {
    const hasEntries = entries.some((entry) => classifySectionType(entry.code) === sectionType);
    if (!hasEntries) continue;
    presentSections.add(sectionType);
    budgetRows.push({
      code: "",
      name: sectionType === "income" ? "INCOME" : "EXPENDITURE",
      notes: "",
      values: Object.fromEntries(columns.filter((column) => column.isBudget || column.isTotal || column.monthIndex !== null).map((column) => [column.key, null])),
      rowType: "section",
      sectionName: sectionType === "income" ? "INCOME" : "EXPENDITURE",
      sectionType,
      subsectionName: "",
      indent: 0,
    });

    entries
      .filter((entry) => classifySectionType(entry.code) === sectionType)
      .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name))
      .forEach((entry) => {
        const { subsectionName, itemName } = splitNominalName(entry.name);
        const subsectionKey = `${sectionType}::${subsectionName}`;

        if (subsectionName && !subsectionKeys.has(subsectionKey)) {
          subsectionKeys.add(subsectionKey);
          budgetRows.push({
            code: "",
            name: subsectionName,
            notes: "",
            values: Object.fromEntries(columns.filter((column) => column.isBudget || column.isTotal || column.monthIndex !== null).map((column) => [column.key, null])),
            rowType: "subsection",
            sectionName: sectionType === "income" ? "INCOME" : "EXPENDITURE",
            sectionType,
            subsectionName: "",
            indent: 0,
          });
        }

        const rowKey = sectionType === "income"
          ? `${sectionType}::${subsectionName}::${entry.code}::${itemName}`
          : `${sectionType}::${subsectionName}::${entry.code}::${itemName}::${entry.accountToken.toUpperCase()}`;
        let row = itemsByKey.get(rowKey);
        if (!row) {
          row = {
            code: entry.code,
            name: itemName,
            notes: entry.accountToken,
            values: Object.fromEntries(columns.filter((column) => column.isBudget || column.isTotal || column.monthIndex !== null).map((column) => [column.key, null])),
            rowType: "item",
            sectionName: sectionType === "income" ? "INCOME" : "EXPENDITURE",
            sectionType,
            subsectionName,
            indent: 0,
          };
          itemsByKey.set(rowKey, row);
          budgetRows.push(row);
        }

        const entryDate = new Date(entry.date);
        const monthColumn = columns.find(
          (column) => column.monthIndex === entryDate.getMonth() && !column.isBudget && !column.isTotal
        );
        if (monthColumn) {
          row.values[monthColumn.key] = (row.values[monthColumn.key] ?? 0) + entry.amount;
        }
        row.values.col_total = (row.values.col_total ?? 0) + entry.amount;
      });
  }

  if (presentSections.size === 0) {
    budgetRows.push({
      code: "",
      name: "EXPENDITURE",
      notes: "",
      values: Object.fromEntries(columns.filter((column) => column.isBudget || column.isTotal || column.monthIndex !== null).map((column) => [column.key, null])),
      rowType: "section",
      sectionName: "EXPENDITURE",
      sectionType: "expenditure",
      subsectionName: "",
      indent: 0,
    });
  }

  return normalizeBudgetSubsections({
    year,
    columns,
    rows: budgetRows,
    sheetName,
  });
}

export function normalizeBudgetSubsections(budget: ParsedBudget): ParsedBudget {
  const nextRows: BudgetRow[] = [];
  const seenSubsections = new Set<string>();

  for (const row of budget.rows) {
    if (row.rowType === "subsection") {
      seenSubsections.add(`${row.sectionName}::${row.name}`);
      nextRows.push(row);
      continue;
    }

    if (row.rowType !== "item" || row.subsectionName) {
      nextRows.push(row);
      continue;
    }

    const { subsectionName, itemName } = splitNominalName(row.name);
    if (!subsectionName) {
      nextRows.push(row);
      continue;
    }

    const subsectionKey = `${row.sectionName}::${subsectionName}`;
    if (!seenSubsections.has(subsectionKey)) {
      seenSubsections.add(subsectionKey);
      nextRows.push({
        code: "",
        name: subsectionName,
        notes: "",
        values: Object.fromEntries(Object.keys(row.values).map((key) => [key, null])),
        rowType: "subsection",
        sectionName: row.sectionName,
        sectionType: row.sectionType,
        subsectionName: "",
        indent: 0,
      });
    }

    nextRows.push({
      ...row,
      name: itemName,
      subsectionName,
    });
  }

  return {
    ...budget,
    rows: nextRows,
  };
}

function rowKey(row: BudgetRow): string {
  return [row.code.trim().toLowerCase(), row.subsectionName.trim().toLowerCase(), row.name.trim().toLowerCase()].join("::");
}

export function mergeActualsIntoSavedBudget(
  savedBudget: ParsedBudget,
  actualBudget: ParsedBudget
): ParsedBudget {
  const normalizedSavedBudget = normalizeBudgetSubsections(savedBudget);
  const normalizedActualBudget = normalizeBudgetSubsections(actualBudget);
  const savedActualColumns = normalizedSavedBudget.columns.filter((column) => column.monthIndex !== null || column.isTotal);
  const actualRowMap = new Map(
    normalizedActualBudget.rows
      .filter((row) => row.rowType === "item")
      .map((row) => [rowKey(row), row] as const)
  );

  const nextRows = normalizedSavedBudget.rows.map((row) => {
    if (row.rowType !== "item") {
      return {
        ...row,
        values: {
          ...row.values,
          ...Object.fromEntries(savedActualColumns.map((column) => [column.key, null])),
        },
      };
    }

    const match = actualRowMap.get(rowKey(row));
    const nextValues = {
      ...row.values,
      ...Object.fromEntries(savedActualColumns.map((column) => [column.key, null])),
    };

    if (match) {
      savedActualColumns.forEach((savedColumn) => {
        const actualColumn = normalizedActualBudget.columns.find((column) => {
          if (savedColumn.isTotal && column.isTotal) return true;
          return savedColumn.monthIndex !== null && savedColumn.monthIndex === column.monthIndex;
        });
        if (actualColumn) {
          nextValues[savedColumn.key] = match.values[actualColumn.key] ?? null;
        }
      });
    }

    return {
      ...row,
      values: nextValues,
    };
  });

  return {
    ...normalizedSavedBudget,
    rows: nextRows,
  };
}

export async function parseNominalActivityPdf(file: File): Promise<ParsedBudget> {
  const arrayBuffer = await file.arrayBuffer();
  const pdfjsLib = await getPdfJs();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  const entries: NominalActivityEntry[] = [];
  let currentCode = "";
  let currentName = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = new Map<number, string[]>();

    textContent.items.forEach((item: any) => {
      const y = item.transform?.[5] ? Math.round(item.transform[5]) : 0;
      const line = (lines.get(y) ?? []).concat(item.str);
      lines.set(y, line);
    });

    const pageLines = Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) => items.join(" ").replace(/\s+/g, " ").trim())
      .filter(Boolean);

    for (const line of pageLines) {
      const metadataMatch = line.match(/^n\/c\s*:\s*(\d+)\s+name\s*:\s*(.*?)\s+account balance\s*:/i);
      if (metadataMatch) {
        currentCode = metadataMatch[1].trim();
        currentName = metadataMatch[2].trim();
        continue;
      }

      if (/^(date|time|page|no\s+type|totals?:|history balance:|account balance:)/i.test(line)) {
        continue;
      }

      const txnMatch = line.match(/^\s*\d+\s+\S+\s+(\d{2}\/\d{2}\/\d{4})\s+(\S+)\s+\S+\s+(.+?)\s+\d+\s+\S+\s+([0-9,]+(?:\.\d{2})?)\s+([0-9,]+(?:\.\d{2})?|-)\s+([0-9,]+(?:\.\d{2})?|-)/i);
      if (!txnMatch || !currentCode || !currentName) {
        continue;
      }

      const [, rawDate, rawAccount, , valueRaw, debitRaw, creditRaw] = txnMatch;
      const date = parseDateString(rawDate);
      const debit = debitRaw === "-" ? 0 : parseAmount(debitRaw);
      const credit = creditRaw === "-" ? 0 : parseAmount(creditRaw);
      const value = parseAmount(valueRaw);
      const sectionType = classifySectionType(currentCode);
      const hasDebitCredit = debit > 0 || credit > 0;

      let amount = 0;
      if (hasDebitCredit) {
        if (sectionType === "income") {
          amount = credit - debit;
        } else if (sectionType === "expenditure") {
          amount = debit - credit;
        } else {
          amount = credit - debit;
        }
      } else {
        amount = value;
      }

      if (!date || amount === 0) continue;
      entries.push({
        code: currentCode,
        name: currentName,
        accountToken: rawAccount,
        date,
        amount,
      });
    }
  }

  const transactions: Transaction[] = entries.map((entry) => ({
    date: entry.date,
    description: entry.accountToken,
    category: entry.name,
    account: entry.code,
    amount: entry.amount,
  }));

  return buildBudgetFromNominalTransactions(transactions, file.name.replace(/\.pdf$/i, ""));
}