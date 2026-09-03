import type { FullShipment } from "@/generated/prisma/client";
import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db/db";
import {
  defaultShippedAtForBillingPeriod,
  fetchFullInboundShipmentsForPeriod,
} from "@/lib/mercadolibre/billing-full-collect";
import { activityMonthBounds } from "@/lib/envios-full/full-shipment-period";
import {
  type FullShipmentRecord,
  type FullShipmentWriteInput,
  finalizeShipmentPatch,
  FullShipmentValidationError,
  normalizeFullShipmentInput,
  normalizeImportedShipmentInput,
  normalizeShipmentUpdateInput,
} from "@/lib/envios-full/full-shipment";
import { getZonedParts } from "@/lib/report-timezone";

function decimalToNumber(value: { toString(): string } | number): number {
  return Number(value);
}

function toRecord(row: FullShipment): FullShipmentRecord {
  return {
    id: row.id,
    shippedAt: row.shippedAt.toISOString(),
    totalCost: decimalToNumber(row.totalCost),
    nonComplianceCost: decimalToNumber(row.nonComplianceCost),
    totalUnits: row.totalUnits,
    costPerUnit: decimalToNumber(row.costPerUnit),
    source: row.source,
    mlInboundId: row.mlInboundId,
    productCount: row.productCount,
    billingYear: row.billingYear,
    billingMonth: row.billingMonth,
    mlChargeDetailId: row.mlChargeDetailId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listFullShipments(
  organizationId: string,
): Promise<FullShipmentRecord[]> {
  const rows = await prisma.fullShipment.findMany({
    where: { organizationId },
    orderBy: [{ shippedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toRecord);
}

export async function listFullShipmentsForPeriod(
  organizationId: string,
  year: number,
  month: number,
): Promise<FullShipmentRecord[]> {
  const { start, end } = activityMonthBounds(year, month);
  const rows = await prisma.fullShipment.findMany({
    where: {
      organizationId,
      shippedAt: { gte: start, lte: end },
    },
    orderBy: [{ shippedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toRecord);
}

/**
 * Meses do ano com pelo menos um envio Full (por data de coleta / shippedAt),
 * alinhado a `listFullShipmentsForPeriod` — o mesmo critério do DRE e da
 * listagem em Relatório Full.
 */
export async function listFullShipmentActivityMonthsForYear(
  organizationId: string,
  year: number,
): Promise<Set<number>> {
  const { start } = activityMonthBounds(year, 1);
  const { end } = activityMonthBounds(year, 12);
  const rows = await prisma.fullShipment.findMany({
    where: { organizationId, shippedAt: { gte: start, lte: end } },
    select: { shippedAt: true },
  });

  const months = new Set<number>();
  for (const row of rows) {
    const parts = getZonedParts(
      row.shippedAt,
      reportsConfig.catalogCompetitionTimezone,
    );
    if (parts.year === year) months.add(parts.month);
  }
  return months;
}

export async function listImportedBillingPeriods(
  organizationId: string,
): Promise<Array<{ year: number; month: number }>> {
  const rows = await prisma.fullShipment.findMany({
    where: {
      organizationId,
      source: "ml_billing",
      billingYear: { not: null },
      billingMonth: { not: null },
    },
    select: { billingYear: true, billingMonth: true },
    distinct: ["billingYear", "billingMonth"],
    orderBy: [{ billingYear: "desc" }, { billingMonth: "desc" }],
  });

  return rows
    .filter(
      (row): row is { billingYear: number; billingMonth: number } =>
        typeof row.billingYear === "number" &&
        typeof row.billingMonth === "number",
    )
    .map((row) => ({ year: row.billingYear, month: row.billingMonth }));
}

export async function createFullShipment(
  organizationId: string,
  input: FullShipmentWriteInput,
): Promise<FullShipmentRecord> {
  const normalized = normalizeFullShipmentInput(input);
  const row = await prisma.fullShipment.create({
    data: {
      organizationId,
      shippedAt: normalized.shippedAt,
      totalCost: normalized.totalCost,
      nonComplianceCost: normalized.nonComplianceCost,
      totalUnits: normalized.totalUnits,
      costPerUnit: normalized.costPerUnit,
      source: normalized.source,
      mlInboundId: normalized.mlInboundId,
      productCount: normalized.productCount,
      billingYear: normalized.billingYear,
      billingMonth: normalized.billingMonth,
      mlChargeDetailId: normalized.mlChargeDetailId,
      notes: normalized.notes,
    },
  });
  return toRecord(row);
}

export async function updateFullShipment(
  organizationId: string,
  id: string,
  input: {
    shippedAt?: Date;
    totalCost?: number;
    totalUnits?: number;
    notes?: string | null;
  },
): Promise<FullShipmentRecord> {
  const existing = await prisma.fullShipment.findFirst({
    where: { id, organizationId },
  });
  if (!existing) {
    throw new FullShipmentValidationError("Envio não encontrado.");
  }

  const patch = normalizeShipmentUpdateInput(input);
  const current = toRecord(existing);
  const finalized = finalizeShipmentPatch(current, patch);

  const row = await prisma.fullShipment.update({
    where: { id, organizationId },
    data: {
      ...patch,
      totalCost: finalized.totalCost,
      totalUnits: finalized.totalUnits,
      costPerUnit: finalized.costPerUnit,
    },
  });
  return toRecord(row);
}

export async function deleteFullShipment(
  organizationId: string,
  id: string,
): Promise<void> {
  await prisma.fullShipment.delete({ where: { id, organizationId } });
}

export type ImportFullShipmentsResult = {
  imported: number;
  skipped: number;
  replaced: number;
  foundInBilling: number;
  probe: {
    fullDetailsRowCount: number;
    groupedInboundCount: number;
    opsInboundCount: number;
    mlDetailsCount: number;
    summaryCount: number;
    unassignedCount: number;
  };
  shipments: FullShipmentRecord[];
};

export async function importFullCollectChargesFromBilling(
  accessToken: string,
  sellerId: number,
  organizationId: string,
  year: number,
  month: number,
  options?: {
    fullDetailsCache?: import("@/lib/mercadolibre/billing-full-collect").FullBillingDetailsCache;
  },
): Promise<ImportFullShipmentsResult> {
  const { shipments, probe } = await fetchFullInboundShipmentsForPeriod(
    accessToken,
    sellerId,
    organizationId,
    year,
    month,
    { fullDetailsCache: options?.fullDetailsCache },
  );

  const { start, end } = activityMonthBounds(year, month);
  const replaced = await prisma.fullShipment.deleteMany({
    where: {
      organizationId,
      source: "ml_billing",
      shippedAt: { gte: start, lte: end },
    },
  });

  if (shipments.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      replaced: replaced.count,
      foundInBilling: 0,
      probe,
      shipments: [],
    };
  }

  const rowsData = shipments.map((shipment) => {
    const normalized = normalizeImportedShipmentInput({
      shippedAt: shipment.shippedAt
        ? new Date(shipment.shippedAt)
        : defaultShippedAtForBillingPeriod(year, month),
      totalCost: shipment.totalCost,
      nonComplianceCost: shipment.nonComplianceCost,
      totalUnits: shipment.totalUnits,
      productCount: shipment.productCount,
      mlInboundId: shipment.inboundId,
      mlChargeDetailId: shipment.chargeDetailIds[0] ?? null,
      billingYear: year,
      billingMonth: month,
      notes: shipment.unassigned
        ? shipment.label
        : `Envio N.º ${shipment.inboundId}`,
    });

    return {
      organizationId,
      shippedAt: normalized.shippedAt,
      totalCost: normalized.totalCost,
      nonComplianceCost: normalized.nonComplianceCost,
      totalUnits: normalized.totalUnits,
      costPerUnit: normalized.costPerUnit,
      source: normalized.source,
      mlInboundId: normalized.mlInboundId,
      productCount: normalized.productCount,
      billingYear: normalized.billingYear,
      billingMonth: normalized.billingMonth,
      mlChargeDetailId: normalized.mlChargeDetailId,
      notes: normalized.notes,
    };
  });

  const CREATE_CHUNK = 100;
  const created: FullShipmentRecord[] = [];
  for (let i = 0; i < rowsData.length; i += CREATE_CHUNK) {
    const chunk = rowsData.slice(i, i + CREATE_CHUNK);
    const rows = await prisma.fullShipment.createManyAndReturn({
      data: chunk,
    });
    created.push(...rows.map(toRecord));
  }

  return {
    imported: created.length,
    skipped: 0,
    replaced: replaced.count,
    foundInBilling: shipments.length,
    probe,
    shipments: created,
  };
}
