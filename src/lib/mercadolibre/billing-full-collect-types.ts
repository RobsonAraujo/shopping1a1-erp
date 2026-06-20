export type FullInboundShipment = {
  inboundId: string;
  shippedAt: string | null;
  totalCost: number;
  totalUnits: number;
  productCount: number;
  chargeDetailIds: string[];
  inventoryIds: string[];
  label: string;
  source: "full_details" | "ml_details" | "summary";
  unassigned: boolean;
};
