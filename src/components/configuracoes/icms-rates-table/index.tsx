"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTableSort } from "@/hooks/use-table-sort";
import type { IcmsRateRow } from "@/lib/tax-report/types";
import type { IcmsRateSortKey, IcmsRatesTableProps } from "./types";
import { IcmsRatesDesktop } from "./IcmsRatesDesktop";
import { IcmsRatesMobile } from "./IcmsRatesMobile";

const DEFAULT_SORT = { key: "uf" as IcmsRateSortKey, direction: "asc" as const };

function getValue(row: IcmsRateRow, key: IcmsRateSortKey): string | number {
  if (key === "uf") return row.uf;
  if (key === "aliquotaBase") return row.aliquotaBase;
  return row.fcp;
}

/** Tabela global (todas as organizações), só leitura — mantida por migration. */
export function IcmsRatesTable({ rows }: IcmsRatesTableProps) {
  const isMobile = useIsMobile();
  const { sort, sortedRows, onSortChange } = useTableSort(rows, getValue, DEFAULT_SORT);

  return isMobile ? (
    <IcmsRatesMobile rows={sortedRows} />
  ) : (
    <IcmsRatesDesktop rows={sortedRows} sort={sort} onSortChange={onSortChange} />
  );
}
