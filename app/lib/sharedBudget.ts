import sharedBudgetJson from "../config/sharedBudget.json";

export interface SharedBudgetBreakdownItem {
  heading: string;
  amount: number;
}

export interface SharedSupplierSpendTarget {
  code: string;
  label: string;
  matches: string[];
}

export interface SharedBudgetConfig {
  year: number;
  totalBudget: number;
  breakdown: SharedBudgetBreakdownItem[];
  supplierSpendTargets: SharedSupplierSpendTarget[];
}

const fallbackConfig: SharedBudgetConfig = {
  year: new Date().getFullYear(),
  totalBudget: 0,
  breakdown: [],
  supplierSpendTargets: [],
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
    supplierSpendTargets: Array.isArray((raw as any).supplierSpendTargets)
      ? (raw as any).supplierSpendTargets
          .map((item: any) => ({
            code: String(item?.code ?? "").trim(),
            label: String(item?.label ?? "").trim(),
            matches: Array.isArray(item?.matches)
              ? item.matches.map((match: unknown) => String(match ?? "").trim()).filter((match: string) => match.length > 0)
              : [],
          }))
          .filter((item: SharedSupplierSpendTarget) => item.code.length > 0 && item.label.length > 0)
      : fallbackConfig.supplierSpendTargets,
  };
}