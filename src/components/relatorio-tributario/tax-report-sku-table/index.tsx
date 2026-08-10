"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { TaxReportSkuTableDesktop } from "@/components/relatorio-tributario/tax-report-sku-table/TaxReportSkuTableDesktop";
import { TaxReportSkuTableMobile } from "@/components/relatorio-tributario/tax-report-sku-table/TaxReportSkuTableMobile";
import type { TaxReportSkuTableProps } from "@/components/relatorio-tributario/tax-report-sku-table/types";

export function TaxReportSkuTable(props: TaxReportSkuTableProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <TaxReportSkuTableMobile {...props} />
  ) : (
    <TaxReportSkuTableDesktop {...props} />
  );
}
