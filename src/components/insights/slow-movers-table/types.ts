import type { SlowMoverRow } from "@/lib/insights/types";

export type SlowMoverSortKey = "coverageDays" | "dailyAvg" | "totalStock";
export type SortDirection = "asc" | "desc";

export type SlowMoverSort = {
  key: SlowMoverSortKey;
  direction: SortDirection;
};

export type SlowMoversTableProps = {
  rows: SlowMoverRow[];
  threshold: number;
  sort: SlowMoverSort;
  onSortChange: (key: SlowMoverSortKey) => void;
};
