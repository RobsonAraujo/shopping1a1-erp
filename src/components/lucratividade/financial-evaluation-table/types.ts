import type { MarginBasis } from "@/lib/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/financial-evaluation-data";

export type SortKey = "product" | "price" | "margin" | "afterAds";
export type SortDir = "asc" | "desc";

export type FinancialEvaluationTableProps = {
  sortedItems: FinancialEvaluationRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  isPeriodMode: boolean;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  refiningMinPrices: boolean;
  minPriceStale: boolean;
  tacosPeriodLabel: string;
  onSelect: (mlItemId: string) => void;
};
