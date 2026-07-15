export interface Transaction {
  date: string;
  description: string;
  category: string;
  account: string;
  amount: number;
}

export interface ColumnMapping {
  date: string;
  description: string;
  category: string;
  account: string;
  /** Single signed amount column. Either this OR (debit + credit) must be provided. */
  amount: string;
  /** Optional: separate debit column (money going out, treated as positive expense). */
  debit?: string;
  /** Optional: separate credit column (money coming in, treated as positive income). */
  credit?: string;
}

// ---------------------------------------------------------------------------
// Budget-report types
// ---------------------------------------------------------------------------

/** Raw workbook held in memory so any sheet can be (re-)parsed without re-reading the file. */
export interface WorkbookMeta {
  sheetNames: string[];
  buffer: ArrayBuffer;
}

/** A single column in the budget spreadsheet. */
export interface BudgetColumn {
  key: string;           // unique key: "col_N"
  label: string;         // display label (e.g. "Jan-24", "Budget 2025")
  monthIndex: number | null; // 0=Jan … 11=Dec, null if not a month
  isBudget: boolean;     // true for "Budget {year}" column
  isTotal: boolean;      // true for "Total" / "YTD" / "Full Year" column
  colIndex: number;      // index in the raw 2-D array
}

export type BudgetRowType = "section" | "subsection" | "item" | "total" | "net";

export type SectionType = "income" | "expenditure" | "unknown";

export interface BudgetRow {
  code: string;
  name: string;
  notes: string;
  /** Values keyed by BudgetColumn.key. null = blank cell. */
  values: Record<string, number | null>;
  rowType: BudgetRowType;
  sectionName: string;
  sectionType: SectionType;
  subsectionName: string; // "" when no subsection
  indent: number;
}

export interface ParsedBudget {
  year: number | null;
  columns: BudgetColumn[];
  rows: BudgetRow[];
  sheetName: string;
}

// ---------------------------------------------------------------------------
// App state machine
// ---------------------------------------------------------------------------

export type AppState =
  | "idle"
  | "sheet-pick"   // user picks which sheet to use
  | "dashboard"    // transaction dashboard
  | "budget";      // budget report view

export interface MonthlySummary {
  month: string;
  income: number;
  expenses: number;
  net: number;
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
}

export interface AccountSummary {
  account: string;
  total: number;
  count: number;
}

/** Balance information extracted from a multi-section bank export. */
export interface SectionBalance {
  sectionCode: string;
  sectionName: string;
  historyBalance: number;
  accountBalance?: number;
}

// ---------------------------------------------------------------------------
// Financial Reports types
// ---------------------------------------------------------------------------

export interface ExpenditureItem {
  code: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  account: string;
}

export interface DebtorItem {
  name: string;
  reference: string;
  amount: number;
  date: string;
  status: string;
  notes: string;
}

export interface ExpenditureReportData {
  items: ExpenditureItem[];
  total: number;
  categories: string[];
}

export interface DebtorsReportData {
  items: DebtorItem[];
  total: number;
  outstandingCount: number;
}

export interface CashAtBankItem {
  code: string;
  name: string;
  balance: number;
  category: string;
}

export interface CashAtBankReportData {
  items: CashAtBankItem[];
  total: number;
}

export interface ReportData {
  expenditure: ExpenditureReportData;
  debtors: DebtorsReportData;
  cashAtBank: CashAtBankReportData;
  generatedAt: string;
}
