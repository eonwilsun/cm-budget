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

export type AppState = "idle" | "mapping" | "dashboard";

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
