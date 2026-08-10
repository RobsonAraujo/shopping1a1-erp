"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { WorkingCapitalTableDesktop } from "@/components/insights/working-capital-table/WorkingCapitalTableDesktop";
import { WorkingCapitalTableMobile } from "@/components/insights/working-capital-table/WorkingCapitalTableMobile";
import type { WorkingCapitalTableProps } from "@/components/insights/working-capital-table/types";

export function WorkingCapitalTable(props: WorkingCapitalTableProps) {
  const isMobile = useIsMobile();
  return isMobile ? <WorkingCapitalTableMobile {...props} /> : <WorkingCapitalTableDesktop {...props} />;
}
