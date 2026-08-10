import type { FullShipmentRecord } from "@/lib/envios-full/full-shipment";

export type FullShipmentsTableProps = {
  shipments: FullShipmentRecord[];
  loading: boolean;
  viewMonthName: string;
  viewYear: number;
  onEdit: (shipment: FullShipmentRecord) => void;
  onDelete: (shipment: FullShipmentRecord) => void;
};
