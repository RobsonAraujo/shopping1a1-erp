import type { TableSort } from "@/components/ui/sortable-th";
import type { SkuAggregation } from "@/lib/tax-report/types";

export type TaxReportSkuSortKey =
  | "quantidadeVendas"
  | "unidadesVendidas"
  | "receitaTotal"
  | "impostoOperacionalMedio"
  | "impostoOperacionalPercentual";

export type TaxReportSkuSort = TableSort<TaxReportSkuSortKey>;

export type TaxReportSkuTableProps = {
  rows: SkuAggregation[];
  searchQuery: string;
  totalCount: number;
  skuPathFor: (sku: string) => string;
  sort: TaxReportSkuSort;
  onSortChange: (key: TaxReportSkuSortKey) => void;
};
