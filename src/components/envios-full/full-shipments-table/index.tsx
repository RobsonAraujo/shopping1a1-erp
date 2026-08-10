"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { FullShipmentsTableDesktop } from "@/components/envios-full/full-shipments-table/FullShipmentsTableDesktop";
import { FullShipmentsTableMobile } from "@/components/envios-full/full-shipments-table/FullShipmentsTableMobile";
import type { FullShipmentsTableProps } from "@/components/envios-full/full-shipments-table/types";

export function FullShipmentsTable(props: FullShipmentsTableProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <FullShipmentsTableMobile {...props} />
  ) : (
    <FullShipmentsTableDesktop {...props} />
  );
}
