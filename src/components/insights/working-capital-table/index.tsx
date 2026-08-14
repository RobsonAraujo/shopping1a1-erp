"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTableSort } from "@/hooks/use-table-sort";
import { WorkingCapitalTableDesktop } from "@/components/insights/working-capital-table/WorkingCapitalTableDesktop";
import { WorkingCapitalTableMobile } from "@/components/insights/working-capital-table/WorkingCapitalTableMobile";
import type {
  WorkingCapitalSortKey,
  WorkingCapitalTableProps,
} from "@/components/insights/working-capital-table/types";
import type { WorkingCapitalRow } from "@/lib/insights/types";

function sortValue(row: WorkingCapitalRow, key: WorkingCapitalSortKey): number {
  return row[key];
}

export function WorkingCapitalTable({ rows }: WorkingCapitalTableProps) {
  const isMobile = useIsMobile();
  const { sort, sortedRows, onSortChange } = useTableSort<WorkingCapitalRow, WorkingCapitalSortKey>(
    rows,
    sortValue,
    { key: "effectiveCapital", direction: "desc" },
  );

  return isMobile ? (
    <WorkingCapitalTableMobile rows={sortedRows} />
  ) : (
    <WorkingCapitalTableDesktop rows={sortedRows} sort={sort} onSortChange={onSortChange} />
  );
}
