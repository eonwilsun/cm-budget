import sharedBudgetJson from "../config/sharedBudget.json";

export interface SharedBudgetBreakdownItem {
  heading: string;
  amount: number;
}

export interface SharedBudgetConfig {
  year: number;
  totalBudget: number;
  breakdown: SharedBudgetBreakdownItem[];
}

const fallbackConfig: SharedBudgetConfig = {
  year: new Date().getFullYear(),
  totalBudget: 0,
  breakdown: [],
};

export function getSharedBudgetConfig(): SharedBudgetConfig {
  const raw = sharedBudgetJson as Partial<SharedBudgetConfig>;

  return {
    year: Number.isFinite(raw.year) ? Number(raw.year) : fallbackConfig.year,
    totalBudget: Number.isFinite(raw.totalBudget)
      ? Number(raw.totalBudget)
      : fallbackConfig.totalBudget,
    breakdown: Array.isArray(raw.breakdown)
      ? raw.breakdown
          .map((item) => ({
            heading: String(item?.heading ?? "").trim(),
            amount: Number(item?.amount ?? 0),
          }))
          .filter((item) => item.heading.length > 0)
      : fallbackConfig.breakdown,
  };
}