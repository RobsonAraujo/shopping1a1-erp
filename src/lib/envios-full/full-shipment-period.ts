import type { FullShipmentSource } from "@/generated/prisma/client";
import { reportsConfig } from "@/config/reports";
import { getCalendarMonthRange } from "@/lib/mercadolibre/revenue-periods";
import { getZonedParts } from "@/lib/report-timezone";

export type FullShipmentPeriodView = {
  source: FullShipmentSource;
  billingYear: number | null;
  billingMonth: number | null;
  shippedAt: string;
};

export function shipmentShippedAtInCalendarMonth(
  shippedAt: string,
  year: number,
  month: number,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): boolean {
  const date = new Date(shippedAt);
  if (Number.isNaN(date.getTime())) return false;
  const parts = getZonedParts(date, timeZone);
  return parts.year === year && parts.month === month;
}

/** @deprecated use shipmentShippedAtInCalendarMonth */
export function shipmentShippedAtInUtcMonth(
  shippedAt: string,
  year: number,
  month: number,
): boolean {
  return shipmentShippedAtInCalendarMonth(shippedAt, year, month);
}

export function matchesFullShipmentViewPeriod(
  shipment: FullShipmentPeriodView,
  year: number,
  month: number,
): boolean {
  return shipmentShippedAtInCalendarMonth(shipment.shippedAt, year, month);
}

export function activityMonthBounds(
  year: number,
  month: number,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
) {
  const range = getCalendarMonthRange(year, month, timeZone);
  return { start: range.from, end: range.to };
}

/** @deprecated use activityMonthBounds */
export function billingMonthUtcBounds(year: number, month: number) {
  return activityMonthBounds(year, month);
}
