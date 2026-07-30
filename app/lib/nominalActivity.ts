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

type ParsedNominalTxnLine = {
  txnType: string;
  rawDate: string;
  rawAccount: string;
  rawDetails: string;
  valueRaw: string;
  debitRaw: string;
  creditRaw: string;
};

type LooseNominalTxnLine = {
  rawDate: string;
  amountRaw: string;
  accountToken: string;
};

type PdfTextContentItem = {
  str?: string;
  transform?: number[];
};

type PdfLineChunk = {
  x: number;
  str: string;
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

function isMoneyToken(value: string): boolean {
  const token = value.trim().replace(/[–—−]/g, "-");
  return (
    token === "-" ||
    /^[+-]?[0-9,]+(?:\.\d{2})?$/.test(token) ||
    /^\([0-9,]+(?:\.\d{2})?\)$/.test(token)
  );
}

function looksLikeNominalTxnPrefix(line: string): boolean {
  return /^\s*\d+\s+\S+\s+\d{2}\/\d{2}\/\d{4}\s+\S+\s+/i.test(line);
}

function parseNominalTxnLine(line: string): ParsedNominalTxnLine | null {
  const compactLine = line.replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
  if (!compactLine) return null;

  const parts = compactLine.split(" ");
  if (parts.length < 6) return null;
  if (!/^\d+$/.test(parts[0])) return null;

  const dateIndex = parts.findIndex((part) => /^\d{2}\/\d{2}\/\d{4}$/.test(part));
  if (dateIndex <= 1) return null;

  const txnType = parts[dateIndex - 1];
  const rawAccount = parts[dateIndex + 1] ?? "";
  if (!rawAccount) return null;

  // Some layouts append status flags (for example "R" or "N") after numeric
  // columns. Skip those first so we can still read [value, debit, credit].
  let lastMoneyIndex = parts.length - 1;
  while (lastMoneyIndex > dateIndex + 1 && !isMoneyToken(parts[lastMoneyIndex])) {
    lastMoneyIndex -= 1;
  }

  // Collect trailing money-like tokens from the right. Different nominal PDF
  // layouts may include either [value, debit, credit] or just [debit, credit].
  const trailingMoneyReversed: string[] = [];
  for (let i = lastMoneyIndex; i > dateIndex + 1; i -= 1) {
    if (!isMoneyToken(parts[i])) break;
    trailingMoneyReversed.push(parts[i]);
  }

  if (trailingMoneyReversed.length < 1) return null;

  const trailingMoney = trailingMoneyReversed.reverse();
  const moneyStartIndex = parts.length - trailingMoney.length;
  const detailsStart = dateIndex + 2;
  const detailsEnd = Math.max(detailsStart, moneyStartIndex);
  const rawDetails = parts.slice(detailsStart, detailsEnd).join(" ");

  const creditRaw = trailingMoney.length >= 2 ? trailingMoney[trailingMoney.length - 1] : "-";
  const debitRaw = trailingMoney.length >= 2 ? trailingMoney[trailingMoney.length - 2] : "-";
  const valueRaw = trailingMoney.length >= 3
    ? trailingMoney[trailingMoney.length - 3]
    : trailingMoney[0] ?? "-";

  return {
    txnType,
    rawDate: parts[dateIndex],
    rawAccount,
    rawDetails,
    valueRaw,
    debitRaw,
    creditRaw,
  };
}

function parseLooseNominalTxnLine(line: string): LooseNominalTxnLine | null {
  const compactLine = line.replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
  if (!compactLine) return null;

  // Guard against summary lines that can carry large balances and would
  // otherwise inflate income/expenditure totals.
  if (/\b(balance|history|totals?|opening|closing|brought\s+forward|carried\s+forward)\b/i.test(compactLine)) {
    return null;
  }

  const dateMatch = compactLine.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  if (!dateMatch) return null;

  const tokens = compactLine.split(" ");
  const dateToken = dateMatch[1];
  const dateIndex = tokens.indexOf(dateToken);
  if (dateIndex <= 1) return null;

  // Loose fallback should still look transaction-like: sequence number + type + date.
  if (!/^\d+$/.test(tokens[0])) return null;
  if (!/^[A-Z]{1,4}$/i.test(tokens[dateIndex - 1] ?? "")) return null;

  const amountToken = [...tokens].reverse().find((token) => isMoneyToken(token) && token !== "-");
  if (!amountToken) return null;

  const accountToken = tokens[dateIndex + 1] ?? "";
  return {
    rawDate: dateToken,
    amountRaw: amountToken,
    accountToken,
  };
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
  const valueColumns = normalizedSavedBudget.columns.filter(
    (column) => column.isBudget || column.monthIndex !== null || column.isTotal
  );
  const savedActualColumns = normalizedSavedBudget.columns.filter((column) => column.monthIndex !== null || column.isTotal);
  const nullValueTemplate = Object.fromEntries(valueColumns.map((column) => [column.key, null]));
  const savedItemKeys = new Set(
    normalizedSavedBudget.rows
      .filter((row) => row.rowType === "item")
      .map((row) => rowKey(row))
  );
  const matchedActualKeys = new Set<string>();
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
      matchedActualKeys.add(rowKey(match));
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

  const findSectionEndIndex = (rows: BudgetRow[], sectionName: string): number => {
    const sectionIndex = rows.findIndex((row) => row.rowType === "section" && row.sectionName === sectionName);
    if (sectionIndex === -1) return rows.length;
    for (let i = sectionIndex + 1; i < rows.length; i += 1) {
      if (rows[i].rowType === "section") return i;
    }
    return rows.length;
  };

  const toSavedColumnValues = (actualRow: BudgetRow) => {
    const values: Record<string, number | null> = { ...nullValueTemplate };
    savedActualColumns.forEach((savedColumn) => {
      const actualColumn = normalizedActualBudget.columns.find((column) => {
        if (savedColumn.isTotal && column.isTotal) return true;
        return savedColumn.monthIndex !== null && savedColumn.monthIndex === column.monthIndex;
      });
      if (actualColumn) {
        values[savedColumn.key] = actualRow.values[actualColumn.key] ?? null;
      }
    });
    return values;
  };

  const appendUnmatchedActualRows = normalizedActualBudget.rows.filter((row) => {
    if (row.rowType !== "item") return false;
    const key = rowKey(row);
    return !savedItemKeys.has(key) && !matchedActualKeys.has(key);
  });

  for (const actualRow of appendUnmatchedActualRows) {
    const sectionName = actualRow.sectionName;
    if (!sectionName) continue;

    let sectionIndex = nextRows.findIndex(
      (row) => row.rowType === "section" && row.sectionName === sectionName
    );

    if (sectionIndex === -1) {
      nextRows.push({
        code: "",
        name: sectionName,
        notes: "",
        values: { ...nullValueTemplate },
        rowType: "section",
        sectionName,
        sectionType: actualRow.sectionType,
        subsectionName: "",
        indent: 0,
      });
      sectionIndex = nextRows.length - 1;
    }

    let insertIndex = findSectionEndIndex(nextRows, sectionName);

    if (actualRow.subsectionName) {
      const subsectionIndex = nextRows.findIndex(
        (row) =>
          row.rowType === "subsection" &&
          row.sectionName === sectionName &&
          row.name.trim().toLowerCase() === actualRow.subsectionName.trim().toLowerCase()
      );

      let resolvedSubsectionIndex = subsectionIndex;
      if (resolvedSubsectionIndex === -1) {
        const sectionEnd = findSectionEndIndex(nextRows, sectionName);
        nextRows.splice(sectionEnd, 0, {
          code: "",
          name: actualRow.subsectionName,
          notes: "",
          values: { ...nullValueTemplate },
          rowType: "subsection",
          sectionName,
          sectionType: actualRow.sectionType,
          subsectionName: "",
          indent: 0,
        });
        resolvedSubsectionIndex = sectionEnd;
      }

      insertIndex = resolvedSubsectionIndex + 1;
      while (insertIndex < nextRows.length) {
        const row = nextRows[insertIndex];
        if (row.rowType === "section" || row.rowType === "subsection" || row.rowType === "total" || row.rowType === "net") {
          break;
        }
        insertIndex += 1;
      }
    }

    nextRows.splice(insertIndex, 0, {
      code: actualRow.code,
      name: actualRow.name,
      notes: actualRow.notes,
      values: toSavedColumnValues(actualRow),
      rowType: "item",
      sectionName,
      sectionType: actualRow.sectionType,
      subsectionName: actualRow.subsectionName,
      indent: actualRow.indent,
    });
  }

  const monthColumns = normalizedSavedBudget.columns.filter((column) => column.monthIndex !== null);
  const totalColumns = normalizedSavedBudget.columns.filter((column) => column.isTotal);

  const rowsWithRecomputedItemTotals = nextRows.map((row) => {
    if (row.rowType !== "item") {
      return row;
    }

    const monthValues = monthColumns.map((column) => row.values[column.key]);
    const hasAnyMonthValue = monthValues.some((value) => typeof value === "number" && value !== 0);
    if (!hasAnyMonthValue || totalColumns.length === 0) {
      return row;
    }

    const recomputedTotal = monthValues.reduce((sum, value) => sum + (value ?? 0), 0);
    const nextValues = { ...row.values };
    for (const totalColumn of totalColumns) {
      nextValues[totalColumn.key] = recomputedTotal;
    }

    return {
      ...row,
      values: nextValues,
    };
  });

  return {
    ...normalizedSavedBudget,
    rows: rowsWithRecomputedItemTotals,
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
  let pendingTxnPrefix = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    const lines = new Map<number, PdfLineChunk[]>();

    textContent.items.forEach((item: PdfTextContentItem) => {
      const yValue = item.transform?.[5];
      const xValue = item.transform?.[4];
      const y = typeof yValue === "number" ? Math.round(yValue) : 0;
      const x = typeof xValue === "number" ? xValue : 0;
      const line = (lines.get(y) ?? []).concat({ x, str: item.str ?? "" });
      lines.set(y, line);
    });

    const pageLines = Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, items]) =>
        items
          .sort((a, b) => a.x - b.x)
          .map((chunk) => chunk.str)
          .join(" ")
          .replace(/\s+/g, " ")
          .trim()
      )
      .filter(Boolean);

    for (const line of pageLines) {
      const metadataMatch = line.match(/^n\/c\s*:?\s*(\d+)\s+name\s*:?\s*(.*?)\s+account\s*balance\s*:?/i);
      if (metadataMatch) {
        currentCode = metadataMatch[1].trim();
        currentName = metadataMatch[2].trim();
        pendingTxnPrefix = "";
        continue;
      }

      const codeAndNameMatch = line.match(/^n\/c\s*:?\s*(\d+)\s+name\s*:?\s*(.+)$/i);
      if (codeAndNameMatch) {
        currentCode = codeAndNameMatch[1].trim();
        currentName = codeAndNameMatch[2].replace(/\s+account\s*balance\s*:?.*$/i, "").trim();
        pendingTxnPrefix = "";
        continue;
      }

      const codeOnlyMatch = line.match(/^n\/c\s*:?\s*(\d+)$/i);
      if (codeOnlyMatch) {
        currentCode = codeOnlyMatch[1].trim();
        pendingTxnPrefix = "";
        continue;
      }

      const nameOnlyMatch = line.match(/^name\s*:?\s*(.+)$/i);
      if (nameOnlyMatch) {
        currentName = nameOnlyMatch[1].replace(/\s+account balance\s*:?.*$/i, "").trim();
        pendingTxnPrefix = "";
        continue;
      }

      if (/^(date|time|page|no\s+type|totals?:|history balance:|account balance:)/i.test(line)) {
        pendingTxnPrefix = "";
        continue;
      }

      let parsedLine = parseNominalTxnLine(line);
      if (!parsedLine && pendingTxnPrefix) {
        parsedLine = parseNominalTxnLine(`${pendingTxnPrefix} ${line}`);
        pendingTxnPrefix = "";
      }

      if (!parsedLine && currentCode && currentName) {
        const looseLine = parseLooseNominalTxnLine(line);
        if (looseLine) {
          const date = parseDateString(looseLine.rawDate);
          const amount = parseAmount(looseLine.amountRaw);
          if (date && amount !== 0) {
            const sectionType = classifySectionType(currentCode);
            entries.push({
              code: currentCode,
              name: currentName,
              accountToken: looseLine.accountToken,
              date,
              amount: sectionType === "income" ? Math.abs(amount) : amount,
            });
            continue;
          }
        }
      }

      if (!parsedLine && looksLikeNominalTxnPrefix(line)) {
        pendingTxnPrefix = line;
        continue;
      }

      if (!parsedLine || !currentCode || !currentName) {
        continue;
      }

      const { txnType, rawDate, rawAccount, rawDetails, valueRaw, debitRaw, creditRaw } = parsedLine;
      const date = parseDateString(rawDate);
      const debit = debitRaw === "-" ? 0 : parseAmount(debitRaw);
      const credit = creditRaw === "-" ? 0 : parseAmount(creditRaw);
      const value = parseAmount(valueRaw);
      const sectionType = classifySectionType(currentCode);
      let amount = value;
      const upperType = txnType.toUpperCase();
      const upperDetails = rawDetails.toUpperCase();
      const isCreditLike = upperType.endsWith("C") || /PROPERTY\s+SOLD|CREDIT\s+NOTE|REFUND|REVERSAL/i.test(upperDetails);

      if (sectionType === "income") {
        // Income lines should always be positive in the report view.
        // Some PDFs place the amount in credit/debit while value is '-'.
        const sourceAmount = value !== 0 ? value : (credit !== 0 ? credit : debit);
        amount = Math.abs(sourceAmount);
      } else if (sectionType === "expenditure") {
        const sourceAmount = value !== 0 ? value : (debit !== 0 ? debit : credit);
        amount = isCreditLike ? -Math.abs(sourceAmount) : Math.abs(sourceAmount);
      } else if (debit > 0 || credit > 0) {
        amount = credit - debit;
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