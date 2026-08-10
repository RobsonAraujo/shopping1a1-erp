import type { SlowMoverRow } from "@/lib/insights/types";

export type SlowMoversTableProps = {
  rows: SlowMoverRow[];
  threshold: number;
};
