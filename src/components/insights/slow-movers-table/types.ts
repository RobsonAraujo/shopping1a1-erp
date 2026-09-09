import type { SortDirection } from "@/components/ui/sortable-th";
import type { SlowMoverRow } from "@/lib/insights/types";

export type { SortDirection };

export type SlowMoverSortKey = "coverageDays" | "dailyAvg" | "totalStock";

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
