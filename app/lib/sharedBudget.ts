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

export interface SharedBudgetImageSize {
  width: number;
  height: number;
}

export interface SharedBudgetConfig {
  year: number;
  totalBudget: number;
  reportExpenditureTotal: number;
  image1Size: SharedBudgetImageSize;
  breakdown: SharedBudgetBreakdownItem[];
  supplierSpendTargets: SharedSupplierSpendTarget[];
}

const fallbackConfig: SharedBudgetConfig = {
  year: new Date().getFullYear(),
  totalBudget: 0,
  reportExpenditureTotal: 0,
  image1Size: {
    width: 307,
    height: 464,
  },
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
  const raw = sharedBudgetJson as {
    year?: unknown;
    totalBudget?: unknown;
    reportExpenditureTotal?: unknown;
    image1Size?: unknown;
    breakdown?: unknown;
    supplierSpendTargets?: unknown;
  };
  const year = toFiniteNumber(raw.year);
  const totalBudget = toFiniteNumber(raw.totalBudget);
  const reportExpenditureTotal = toFiniteNumber(raw.reportExpenditureTotal);
  const rawImage1Size = raw.image1Size as { width?: unknown; height?: unknown } | null | undefined;
  const image1Width = rawImage1Size ? toFiniteNumber(rawImage1Size.width) : null;
  const image1Height = rawImage1Size ? toFiniteNumber(rawImage1Size.height) : null;
  const rawSupplierSpendTargets = raw.supplierSpendTargets;

  return {
    year: year !== null ? year : fallbackConfig.year,
    totalBudget: totalBudget !== null ? totalBudget : fallbackConfig.totalBudget,
    reportExpenditureTotal: reportExpenditureTotal !== null ? reportExpenditureTotal : fallbackConfig.reportExpenditureTotal,
    image1Size: {
      width: image1Width !== null ? image1Width : fallbackConfig.image1Size.width,
      height: image1Height !== null ? image1Height : fallbackConfig.image1Size.height,
    },
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