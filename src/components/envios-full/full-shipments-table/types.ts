import type { FullShipmentRecord } from "@/lib/envios-full/full-shipment";
import type { TableSort } from "@/components/ui/sortable-th";

export type FullShipmentSortKey =
  | "shippedAt"
  | "productCount"
  | "totalCost"
  | "totalUnits"
  | "costPerUnit";

export type FullShipmentsTableProps = {
  shipments: FullShipmentRecord[];
  loading: boolean;
  viewMonthName: string;
  viewYear: number;
  onEdit: (shipment: FullShipmentRecord) => void;
  onDelete: (shipment: FullShipmentRecord) => void;
};

export type FullShipmentsTableViewProps = FullShipmentsTableProps & {
  sort: TableSort<FullShipmentSortKey>;
  onSortChange: (key: FullShipmentSortKey) => void;
};
