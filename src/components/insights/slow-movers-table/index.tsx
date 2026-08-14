"use client";

import { useMemo, useState } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { SlowMoversTableDesktop } from "@/components/insights/slow-movers-table/SlowMoversTableDesktop";
import { SlowMoversTableMobile } from "@/components/insights/slow-movers-table/SlowMoversTableMobile";
import type {
  SlowMoverSort,
  SlowMoverSortKey,
  SortDirection,
} from "@/components/insights/slow-movers-table/types";
import type { SlowMoverRow } from "@/lib/insights/types";

const DEFAULT_SORT: SlowMoverSort = { key: "coverageDays", direction: "desc" };

function sortValue(row: SlowMoverRow, key: SlowMoverSortKey): number {
  if (key === "coverageDays") return row.coverageDays ?? Number.POSITIVE_INFINITY;
  return row[key];
}

function sortRows(rows: SlowMoverRow[], sort: SlowMoverSort): SlowMoverRow[] {
  const dir: SortDirection = sort.direction;
  return [...rows].sort((a, b) => {
    const diff = sortValue(a, sort.key) - sortValue(b, sort.key);
    return dir === "asc" ? diff : -diff;
  });
}

export function SlowMoversTable({ rows, threshold }: { rows: SlowMoverRow[]; threshold: number }) {
  const isMobile = useIsMobile();
  const [sort, setSort] = useState<SlowMoverSort>(DEFAULT_SORT);

  const sortedRows = useMemo(() => sortRows(rows, sort), [rows, sort]);

  const handleSortChange = (key: SlowMoverSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, direction: prev.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "desc" },
    );
  };

  const props = { rows: sortedRows, threshold, sort, onSortChange: handleSortChange };

  return isMobile ? <SlowMoversTableMobile {...props} /> : <SlowMoversTableDesktop {...props} />;
}
