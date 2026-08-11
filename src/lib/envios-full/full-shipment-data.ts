import type { FullShipment } from "@/generated/prisma/client";
import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db";
import {
  defaultShippedAtForBillingPeriod,
  fetchFullInboundShipmentsForPeriod,
} from "@/lib/mercadolibre/billing-full-collect";
import { activityMonthBounds } from "@/lib/full-shipment-period";
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

export async function listFullShipments(): Promise<FullShipmentRecord[]> {
  const rows = await prisma.fullShipment.findMany({
    orderBy: [{ shippedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toRecord);
}

export async function listFullShipmentsForPeriod(
  year: number,
  month: number,
): Promise<FullShipmentRecord[]> {
  const { start, end } = activityMonthBounds(year, month);
  const rows = await prisma.fullShipment.findMany({
    where: {
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
  year: number,
): Promise<Set<number>> {
  const { start } = activityMonthBounds(year, 1);
  const { end } = activityMonthBounds(year, 12);
  const rows = await prisma.fullShipment.findMany({
    where: { shippedAt: { gte: start, lte: end } },
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

export async function listImportedBillingPeriods(): Promise<
  Array<{ year: number; month: number }>
> {
  const rows = await prisma.fullShipment.findMany({
    where: {
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
  input: FullShipmentWriteInput,
): Promise<FullShipmentRecord> {
  const normalized = normalizeFullShipmentInput(input);
  const row = await prisma.fullShipment.create({
    data: {
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
  id: string,
  input: {
    shippedAt?: Date;
    totalCost?: number;
    totalUnits?: number;
    notes?: string | null;
  },
): Promise<FullShipmentRecord> {
  const existing = await prisma.fullShipment.findUnique({ where: { id } });
  if (!existing) {
    throw new FullShipmentValidationError("Envio não encontrado.");
  }

  const patch = normalizeShipmentUpdateInput(input);
  const current = toRecord(existing);
  const finalized = finalizeShipmentPatch(current, patch);

  const row = await prisma.fullShipment.update({
    where: { id },
    data: {
      ...patch,
      totalCost: finalized.totalCost,
      totalUnits: finalized.totalUnits,
      costPerUnit: finalized.costPerUnit,
    },
  });
  return toRecord(row);
}

export async function deleteFullShipment(id: string): Promise<void> {
  await prisma.fullShipment.delete({ where: { id } });
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
  year: number,
  month: number,
): Promise<ImportFullShipmentsResult> {
  const { shipments, probe } = await fetchFullInboundShipmentsForPeriod(
    accessToken,
    sellerId,
    year,
    month,
  );

  const { start, end } = activityMonthBounds(year, month);
  const replaced = await prisma.fullShipment.deleteMany({
    where: {
      source: "ml_billing",
      shippedAt: { gte: start, lte: end },
    },
  });

  const created: FullShipmentRecord[] = [];

  for (const shipment of shipments) {
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

    const row = await prisma.fullShipment.create({
      data: {
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
    created.push(toRecord(row));
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
