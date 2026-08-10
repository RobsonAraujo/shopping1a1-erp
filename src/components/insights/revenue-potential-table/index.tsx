"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { RevenuePotentialTableDesktop } from "@/components/insights/revenue-potential-table/RevenuePotentialTableDesktop";
import { RevenuePotentialTableMobile } from "@/components/insights/revenue-potential-table/RevenuePotentialTableMobile";
import type { RevenuePotentialTableProps } from "@/components/insights/revenue-potential-table/types";

export function RevenuePotentialTable(props: RevenuePotentialTableProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <RevenuePotentialTableMobile {...props} />
  ) : (
    <RevenuePotentialTableDesktop {...props} />
  );
}

export type {
  RevenuePotentialTableProps,
  EffectiveRow,
  SortKey,
  SortDir,
} from "@/components/insights/revenue-potential-table/types";
