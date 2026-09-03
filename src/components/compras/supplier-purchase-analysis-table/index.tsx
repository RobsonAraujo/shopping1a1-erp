"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTableSort } from "@/hooks/use-table-sort";
import { SupplierPurchaseAnalysisTableDesktop } from "@/components/compras/supplier-purchase-analysis-table/SupplierPurchaseAnalysisTableDesktop";
import { SupplierPurchaseAnalysisTableMobile } from "@/components/compras/supplier-purchase-analysis-table/SupplierPurchaseAnalysisTableMobile";
import type {
  SupplierPurchaseAnalysisSortKey,
  SupplierPurchaseAnalysisTableProps,
} from "@/components/compras/supplier-purchase-analysis-table/types";
import type { PurchaseAnalysisItemRow } from "@/lib/compras/purchase-analysis-rows";

function getSortValue(
  row: PurchaseAnalysisItemRow,
  key: SupplierPurchaseAnalysisSortKey,
): number {
  switch (key) {
    case "totalStock":
      return row.totalStock;
    case "unitsSold":
      return row.unitsSold;
    case "coverageDays":
      return row.analysis.coverageDays ?? Number.POSITIVE_INFINITY;
    case "suggestedQty":
      return row.analysis.suggestedQty;
  }
}

export function SupplierPurchaseAnalysisTable({
  rows,
  emptyMessage,
}: SupplierPurchaseAnalysisTableProps) {
  const isMobile = useIsMobile();
  const { sort, sortedRows, onSortChange } = useTableSort<
    PurchaseAnalysisItemRow,
    SupplierPurchaseAnalysisSortKey
  >(rows, getSortValue, { key: "suggestedQty", direction: "desc" });

  return isMobile ? (
    <SupplierPurchaseAnalysisTableMobile
      rows={sortedRows}
      emptyMessage={emptyMessage}
    />
  ) : (
    <SupplierPurchaseAnalysisTableDesktop
      rows={sortedRows}
      emptyMessage={emptyMessage}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
