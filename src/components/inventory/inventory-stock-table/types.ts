import type { TableSort } from "@/components/ui/sortable-th";

export type InventoryRow = {
  mlItemId: string;
  sku: string | null;
  title: string;
  imageUrl?: string;
  mlStatus: string;
  mlStock: number;
  warehouseStock: number;
  isFulfillment: boolean;
  catalogListing: boolean;
  mlStockOnTheWay: number;
  mlProcessTransfer: number;
  mlProcessInternal: number;
  leadTimeDays: number | null;
  needsPurchaseAttention: boolean;
};

export type SupplierGroup = {
  supplier: string;
  rows: InventoryRow[];
};

export type InventorySortKey =
  | "warehouseStock"
  | "mlStock"
  | "onTheWay"
  | "totalStock"
  | "leadTimeDays"
  | "needsPurchaseAttention";

export type InventoryStockTableGridProps = {
  rows: InventoryRow[];
  filteredRows: InventoryRow[];
  supplierGroups: SupplierGroup[];
  searchQuery: string;
  sort: TableSort<InventorySortKey>;
  onSortChange: (key: InventorySortKey) => void;
  onEdit: (mlItemId: string) => void;
  onSettings: (mlItemId: string) => void;
};
