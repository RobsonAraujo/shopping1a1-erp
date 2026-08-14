"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { useTableSort } from "@/hooks/use-table-sort";
import { FullShipmentsTableDesktop } from "@/components/envios-full/full-shipments-table/FullShipmentsTableDesktop";
import { FullShipmentsTableMobile } from "@/components/envios-full/full-shipments-table/FullShipmentsTableMobile";
import type {
  FullShipmentSortKey,
  FullShipmentsTableProps,
} from "@/components/envios-full/full-shipments-table/types";
import type { FullShipmentRecord } from "@/lib/envios-full/full-shipment";

const DEFAULT_SORT = { key: "totalCost" as FullShipmentSortKey, direction: "desc" as const };

function getValue(shipment: FullShipmentRecord, key: FullShipmentSortKey): string | number {
  switch (key) {
    case "shippedAt":
      return new Date(shipment.shippedAt).getTime();
    case "productCount":
      return shipment.productCount ?? 0;
    case "totalCost":
      return shipment.totalCost;
    case "totalUnits":
      return shipment.totalUnits;
    case "costPerUnit":
      return shipment.costPerUnit;
    default:
      return 0;
  }
}

export function FullShipmentsTable(props: FullShipmentsTableProps) {
  const isMobile = useIsMobile();
  const { sort, sortedRows, onSortChange } = useTableSort(props.shipments, getValue, DEFAULT_SORT);

  return isMobile ? (
    <FullShipmentsTableMobile {...props} shipments={sortedRows} />
  ) : (
    <FullShipmentsTableDesktop
      {...props}
      shipments={sortedRows}
      sort={sort}
      onSortChange={onSortChange}
    />
  );
}
