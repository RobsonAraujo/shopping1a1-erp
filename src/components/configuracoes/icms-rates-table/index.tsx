"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTableSort } from "@/hooks/use-table-sort";
import type { IcmsRateRow } from "@/lib/tax-report/types";
import type { IcmsRateSortKey } from "./types";
import { IcmsRatesDesktop } from "./IcmsRatesDesktop";
import { IcmsRatesMobile } from "./IcmsRatesMobile";

const DEFAULT_SORT = { key: "uf" as IcmsRateSortKey, direction: "asc" as const };

function getValue(row: IcmsRateRow, key: IcmsRateSortKey): string | number {
  if (key === "uf") return row.uf;
  if (key === "aliquotaBase") return row.aliquotaBase;
  return row.fcp;
}

export function IcmsRatesTable({
  rows,
  saving,
  onSave,
}: {
  rows: IcmsRateRow[];
  saving: boolean;
  onSave: (row: IcmsRateRow) => Promise<void>;
}) {
  const isMobile = useIsMobile();
  const { sort, sortedRows, onSortChange } = useTableSort(rows, getValue, DEFAULT_SORT);

  return isMobile ? (
    <IcmsRatesMobile rows={sortedRows} saving={saving} onSave={onSave} />
  ) : (
    <IcmsRatesDesktop
      rows={sortedRows}
      saving={saving}
      onSave={onSave}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
