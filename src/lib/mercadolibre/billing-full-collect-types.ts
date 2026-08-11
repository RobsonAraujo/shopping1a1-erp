export type FullInboundShipment = {
  inboundId: string;
  shippedAt: string | null;
  totalCost: number;
  /** Parte do totalCost referente a cobranças de inconformidade (INBOUND_PENALTY/OVERAGE) do mesmo envio. */
  nonComplianceCost: number;
  totalUnits: number;
  productCount: number;
  chargeDetailIds: string[];
  inventoryIds: string[];
  label: string;
  source: "full_details" | "ml_details" | "summary";
  unassigned: boolean;
};
