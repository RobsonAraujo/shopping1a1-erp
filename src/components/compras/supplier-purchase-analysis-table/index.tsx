"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { SupplierPurchaseAnalysisTableDesktop } from "@/components/compras/supplier-purchase-analysis-table/SupplierPurchaseAnalysisTableDesktop";
import { SupplierPurchaseAnalysisTableMobile } from "@/components/compras/supplier-purchase-analysis-table/SupplierPurchaseAnalysisTableMobile";
import type { SupplierPurchaseAnalysisTableProps } from "@/components/compras/supplier-purchase-analysis-table/types";

export function SupplierPurchaseAnalysisTable(
  props: SupplierPurchaseAnalysisTableProps,
) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <SupplierPurchaseAnalysisTableMobile {...props} />
  ) : (
    <SupplierPurchaseAnalysisTableDesktop {...props} />
  );
}
