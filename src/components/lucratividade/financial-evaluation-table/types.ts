import type { MarginBasis } from "@/lib/pricing/financial-margin";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";

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
