"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTableSort } from "@/hooks/use-table-sort";
import { TaxReportSkuTableDesktop } from "@/components/relatorio-tributario/tax-report-sku-table/TaxReportSkuTableDesktop";
import { TaxReportSkuTableMobile } from "@/components/relatorio-tributario/tax-report-sku-table/TaxReportSkuTableMobile";
import type {
  TaxReportSkuSortKey,
  TaxReportSkuTableProps,
} from "@/components/relatorio-tributario/tax-report-sku-table/types";
import {
  skuImpostoOperacionalMedio,
  skuImpostoOperacionalPercentual,
} from "@/lib/tax-report/imposto-operacional";
import type { SkuAggregation } from "@/lib/tax-report/types";

type TaxReportSkuTableRootProps = Omit<TaxReportSkuTableProps, "sort" | "onSortChange">;

function getSkuSortValue(row: SkuAggregation, key: TaxReportSkuSortKey): number {
  if (key === "impostoOperacionalMedio") return skuImpostoOperacionalMedio(row);
  if (key === "impostoOperacionalPercentual") return skuImpostoOperacionalPercentual(row);
  return row[key];
}

export function TaxReportSkuTable({ rows, ...rest }: TaxReportSkuTableRootProps) {
  const isMobile = useIsMobile();
  const { sort, sortedRows, onSortChange } = useTableSort<SkuAggregation, TaxReportSkuSortKey>(
    rows,
    getSkuSortValue,
    { key: "receitaTotal", direction: "desc" },
  );

  const props: TaxReportSkuTableProps = { rows: sortedRows, sort, onSortChange, ...rest };

  return isMobile ? (
    <TaxReportSkuTableMobile {...props} />
  ) : (
    <TaxReportSkuTableDesktop {...props} />
  );
}
