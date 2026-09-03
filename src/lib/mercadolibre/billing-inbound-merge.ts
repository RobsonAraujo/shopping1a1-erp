import { reportsConfig } from "@/config/reports";
import { shipmentShippedAtInCalendarMonth } from "@/lib/envios-full/full-shipment-period";
import { getZonedParts } from "@/lib/report-timezone";
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
      nonComplianceCost: billing?.nonComplianceCost ?? 0,
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

/**
 * Coletas do fim de M-1 costumam cair no extrato M com data de cobrança nos
 * primeiros dias do mês. Coletas reais de M tendem a aparecer no extrato M+1.
 */
export const BILLING_MONTH_BLEED_CUTOFF_DAY = 10;

export type BillingMonthBleedGuard = {
  currentPeriodKey: string;
  nextPeriodKey: string;
  inboundBillingKeys: Map<string, Set<string>>;
};

function passesBillingMonthBleedGuard(
  shipment: FullInboundShipment,
  year: number,
  month: number,
  bleedGuard: BillingMonthBleedGuard,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): boolean {
  if (shipment.unassigned) return true;

  const keys = bleedGuard.inboundBillingKeys.get(shipment.inboundId);
  if (!keys) return true;

  const onlyInCurrentBillingPeriod =
    keys.has(bleedGuard.currentPeriodKey) &&
    !keys.has(bleedGuard.nextPeriodKey);
  if (!onlyInCurrentBillingPeriod) return true;

  if (!shipment.shippedAt) return true;
  const parts = getZonedParts(new Date(shipment.shippedAt), timeZone);
  if (parts.year !== year || parts.month !== month) return true;

  return parts.day > BILLING_MONTH_BLEED_CUTOFF_DAY;
}

export function filterShipmentsByActivityMonth(
  shipments: FullInboundShipment[],
  year: number,
  month: number,
  bleedGuard?: BillingMonthBleedGuard,
): FullInboundShipment[] {
  return shipments.filter((shipment) => {
    if (shipment.shippedAt == null) return false;
    if (!shipmentShippedAtInCalendarMonth(shipment.shippedAt, year, month)) {
      return false;
    }
    if (!bleedGuard) return true;
    return passesBillingMonthBleedGuard(shipment, year, month, bleedGuard);
  });
}
