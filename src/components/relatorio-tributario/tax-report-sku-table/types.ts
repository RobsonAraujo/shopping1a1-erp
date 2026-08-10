import type { SkuAggregation } from "@/lib/tax-report/types";

export type TaxReportSkuTableProps = {
  rows: SkuAggregation[];
  searchQuery: string;
  totalCount: number;
  skuPathFor: (sku: string) => string;
};
