import type { RevenuePotentialRow } from "@/lib/insights/types";

export type SortKey =
  | "product"
  | "price"
  | "dailyAvg"
  | "potential"
  | "current"
  | "gap";
export type SortDir = "asc" | "desc";

export type EffectiveRow = RevenuePotentialRow & {
  effectiveDailyAvg: number;
  effectivePotential: number;
  effectiveGap: number;
  isOverridden: boolean;
  isExcluded: boolean;
};

export type RevenuePotentialTableProps = {
  rows: EffectiveRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  overrides: Record<string, number>;
  setOverride: (mlItemId: string, value: number) => void;
  clearOverride: (mlItemId: string) => void;
  toggleExcluded: (mlItemId: string) => void;
};
