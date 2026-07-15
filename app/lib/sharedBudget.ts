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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    if (normalized.length === 0) {
      return null;
    }
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function getSharedBudgetConfig(): SharedBudgetConfig {
  const raw = sharedBudgetJson as Partial<SharedBudgetConfig>;
  const year = toFiniteNumber(raw.year);
  const totalBudget = toFiniteNumber(raw.totalBudget);

  return {
    year: year !== null ? year : fallbackConfig.year,
    totalBudget: totalBudget !== null ? totalBudget : fallbackConfig.totalBudget,
    breakdown: Array.isArray(raw.breakdown)
      ? raw.breakdown
          .map((item) => ({
            heading: String(item?.heading ?? "").trim(),
            amount: toFiniteNumber(item?.amount) ?? 0,
          }))
          .filter((item) => item.heading.length > 0)
      : fallbackConfig.breakdown,
  };
}