import type { TableSort } from "@/components/ui/sortable-th";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import type { TargetPriceCell } from "@/lib/lucratividade/target-margin";
import type { MarginBasis } from "@/lib/pricing/financial-margin";

export type SortKey = "product" | "sales" | "price" | "margin" | "afterAds";

export type FinancialEvaluationTableProps = {
  rows: FinancialEvaluationRow[];
  sort: TableSort<SortKey>;
  /** Clique no cabeçalho: alterna a direção da coluna ativa. */
  onSortChange: (key: SortKey) => void;
  /** Ordenação explícita (seletor do mobile). */
  onSortSet: (sort: TableSort<SortKey>) => void;
  /** Simulação no preço de hoje (sem coluna de vendas). */
  isSimulation: boolean;
  targetMarginPercent: number;
  marginBasis: MarginBasis;
  targetCellFor: (row: FinancialEvaluationRow) => TargetPriceCell;
  onSelect: (mlItemId: string) => void;
};
