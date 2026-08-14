import type { TableSort } from "@/components/ui/sortable-th";
import type { WorkingCapitalRow } from "@/lib/insights/types";

export type WorkingCapitalSortKey =
  | "unitsNeeded"
  | "unitCost"
  | "grossCapital"
  | "effectiveCapital";

export type WorkingCapitalTableProps = {
  rows: WorkingCapitalRow[];
};

export type WorkingCapitalTableDesktopProps = WorkingCapitalTableProps & {
  sort: TableSort<WorkingCapitalSortKey>;
  onSortChange: (key: WorkingCapitalSortKey) => void;
};
