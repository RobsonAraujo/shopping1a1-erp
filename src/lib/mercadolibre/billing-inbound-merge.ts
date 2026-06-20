import { shipmentShippedAtInCalendarMonth } from "@/lib/full-shipment-period";
import type { InboundOperationDiscovery } from "./fulfillment-inbound-operations";
import type { FullInboundShipment } from "./billing-full-collect-types";

export type { FullInboundShipment } from "./billing-full-collect-types";

export function nextCalendarMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 };
  return { year, month: month + 1 };
}

export function mergeOperationsWithBillingCosts(
  discoveries: Map<string, InboundOperationDiscovery>,
  billingShipments: FullInboundShipment[],
): FullInboundShipment[] {
  const costByInbound = new Map<string, FullInboundShipment>();
  for (const shipment of billingShipments) {
    const existing = costByInbound.get(shipment.inboundId);
    if (!existing || shipment.totalCost > existing.totalCost) {
      costByInbound.set(shipment.inboundId, shipment);
    }
  }

  const results: FullInboundShipment[] = [];
  for (const discovery of discoveries.values()) {
    const billing = costByInbound.get(discovery.inboundId);
    results.push({
      inboundId: discovery.inboundId,
      shippedAt: discovery.shippedAt,
      totalCost: billing?.totalCost ?? 0,
      totalUnits: discovery.totalUnits,
      productCount:
        discovery.productCount > 0
          ? discovery.productCount
          : (billing?.productCount ?? 0),
      chargeDetailIds: billing?.chargeDetailIds ?? [],
      inventoryIds: billing?.inventoryIds ?? [],
      label: billing?.label ?? `Envio N.º ${discovery.inboundId}`,
      source: billing?.source ?? "full_details",
      unassigned: false,
    });
  }

  return results.sort((a, b) =>
    (a.shippedAt ?? "").localeCompare(b.shippedAt ?? ""),
  );
}

export function filterShipmentsByActivityMonth(
  shipments: FullInboundShipment[],
  year: number,
  month: number,
): FullInboundShipment[] {
  return shipments.filter(
    (shipment) =>
      shipment.shippedAt != null &&
      shipmentShippedAtInCalendarMonth(shipment.shippedAt, year, month),
  );
}
