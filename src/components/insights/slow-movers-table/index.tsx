"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { SlowMoversTableDesktop } from "@/components/insights/slow-movers-table/SlowMoversTableDesktop";
import { SlowMoversTableMobile } from "@/components/insights/slow-movers-table/SlowMoversTableMobile";
import type { SlowMoversTableProps } from "@/components/insights/slow-movers-table/types";

export function SlowMoversTable(props: SlowMoversTableProps) {
  const isMobile = useIsMobile();
  return isMobile ? <SlowMoversTableMobile {...props} /> : <SlowMoversTableDesktop {...props} />;
}
