import sharedBudgetJson from "../config/sharedBudget.json";

export interface SharedBudgetBreakdownItem {
  heading: string;
  amount: number;
  subsectionHeading?: string;
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

function parseBreakdownItem(rawItem: unknown, subsectionHeading?: string): SharedBudgetBreakdownItem | null {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const item = rawItem as { heading?: unknown; amount?: unknown };
  const heading = String(item.heading ?? "").trim();
  if (!heading) {
    return null;
  }

  const parsedItem: SharedBudgetBreakdownItem = {
    heading,
    amount: toFiniteNumber(item.amount) ?? 0,
  };

  if (subsectionHeading) {
    parsedItem.subsectionHeading = subsectionHeading;
  }

  return parsedItem;
}

function parseBreakdown(rawBreakdown: unknown): SharedBudgetBreakdownItem[] {
  if (!Array.isArray(rawBreakdown)) {
    return fallbackConfig.breakdown;
  }

  return rawBreakdown.flatMap((entry) => {
    if (!entry || typeof entry !== "object") {
      return [];
    }

    const group = entry as { heading?: unknown; items?: unknown };
    const groupHeading = String(group.heading ?? "").trim();
    if (Array.isArray(group.items)) {
      return group.items
        .map((item) => parseBreakdownItem(item, groupHeading || undefined))
        .filter((item): item is SharedBudgetBreakdownItem => item !== null);
    }

    const parsedItem = parseBreakdownItem(entry);
    return parsedItem ? [parsedItem] : [];
  });
}

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
  const raw = sharedBudgetJson as Partial<SharedBudgetConfig> & { supplierSpendTargets?: unknown };
  const year = toFiniteNumber(raw.year);
  const totalBudget = toFiniteNumber(raw.totalBudget);
  const rawSupplierSpendTargets = raw.supplierSpendTargets;

  return {
    year: year !== null ? year : fallbackConfig.year,
    totalBudget: totalBudget !== null ? totalBudget : fallbackConfig.totalBudget,
    breakdown: parseBreakdown(raw.breakdown),
    supplierSpendTargets: Array.isArray(rawSupplierSpendTargets)
      ? rawSupplierSpendTargets
          .map((item) => {
            const rawTarget = item as { code?: unknown; label?: unknown; matches?: unknown };
            return {
              code: String(rawTarget.code ?? "").trim(),
              label: String(rawTarget.label ?? "").trim(),
              matches: Array.isArray(rawTarget.matches)
                ? rawTarget.matches.map((match: unknown) => String(match ?? "").trim()).filter((match: string) => match.length > 0)
                : [],
            };
          })
          .filter((item: SharedSupplierSpendTarget) => item.code.length > 0 && item.label.length > 0)
      : fallbackConfig.supplierSpendTargets,
  };
}