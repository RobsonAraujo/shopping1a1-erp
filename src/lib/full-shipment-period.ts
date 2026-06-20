import type { FullShipmentSource } from "@/generated/prisma/client";
import { billingMonthUtcRange } from "@/lib/mercadolibre/billing-full-collect";

export type FullShipmentPeriodView = {
  source: FullShipmentSource;
  billingYear: number | null;
  billingMonth: number | null;
  shippedAt: string;
};

export function shipmentShippedAtInUtcMonth(
  shippedAt: string,
  year: number,
  month: number,
): boolean {
  const date = new Date(shippedAt);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month
  );
}

export function matchesFullShipmentViewPeriod(
  shipment: FullShipmentPeriodView,
  year: number,
  month: number,
): boolean {
  if (shipment.source === "ml_billing") {
    return shipment.billingYear === year && shipment.billingMonth === month;
  }
  return shipmentShippedAtInUtcMonth(shipment.shippedAt, year, month);
}

export function billingMonthUtcBounds(year: number, month: number) {
  return billingMonthUtcRange(year, month);
}
