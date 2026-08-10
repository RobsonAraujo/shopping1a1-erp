"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { InventoryStockTableDesktop } from "@/components/inventory/inventory-stock-table/InventoryStockTableDesktop";
import { InventoryStockTableMobile } from "@/components/inventory/inventory-stock-table/InventoryStockTableMobile";
import type { InventoryStockTableGridProps } from "@/components/inventory/inventory-stock-table/types";

export function InventoryStockTableGrid(props: InventoryStockTableGridProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <InventoryStockTableMobile {...props} />
  ) : (
    <InventoryStockTableDesktop {...props} />
  );
}

export type {
  InventoryRow,
  InventoryStockTableGridProps,
  SupplierGroup,
} from "@/components/inventory/inventory-stock-table/types";
