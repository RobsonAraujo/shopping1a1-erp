import { Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/db";
import {
  applyManualLineEdit,
  commitReconciledLinesAsTruth,
  isDreEditableLineKey,
  type DreEditableLineKey,
  type DreLineBreakdownItem,
  type DreMonthSnapshotPayload,
} from "@/lib/dre/dre-calculations";
import {
  emptyDreMonthSnapshotPayload,
  parseSnapshotPayload,
} from "@/lib/dre/dre-month-data";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { aggregateReconciliationRows } from "@/lib/dre/reconciliation/aggregate";
import { buildReconciliationDiff } from "@/lib/dre/reconciliation/diff";
import type {
  DreReconciliationLineDiff,
  ReconciliationLineAggregation,
  ReconciliationParseResult,
  ReconciliationParseWarning,
  UnrecognizedFeeSummary,
} from "@/lib/dre/reconciliation/types";

const BREAKDOWN_FIELD: Partial<
  Record<DreEditableLineKey, keyof DreMonthSnapshotPayload>
> = {
  revenueMl: "revenueBreakdown",
  cancelledSalesMl: "cancelledSalesBreakdown",
  saleFeeMl: "saleFeeBreakdown",
  sellerShippingMl: "sellerShippingBreakdown",
  adsCost: "adsCostBreakdown",
  partialReturnsMl: "partialReturnsBreakdown",
  returnFeeMl: "returnFeeBreakdown",
  specialFeesMl: "specialFeesBreakdown",
  fullShippingMl: "fullShippingBreakdown",
  fullStorageMl: "fullStorageBreakdown",
  fullNonComplianceMl: "fullNonComplianceBreakdown",
  minhaPaginaMl: "minhaPaginaBreakdown",
  affiliateFeeMl: "affiliateFeeBreakdown",
};

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseAggregation(raw: unknown): ReconciliationLineAggregation {
  const value = raw as ReconciliationLineAggregation;
  return {
    amounts: value.amounts ?? {},
    breakdowns: value.breakdowns ?? {},
    unrecognizedFees: value.unrecognizedFees ?? [],
    warnings: value.warnings ?? [],
  };
}

function parseAcceptedKeys(raw: unknown): DreEditableLineKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (key): key is DreEditableLineKey =>
      typeof key === "string" && isDreEditableLineKey(key),
  );
}

async function loadMonthPayload(
  organizationId: string,
  year: number,
  month: number,
): Promise<DreMonthSnapshotPayload | null> {
  const snapshot = await prisma.dreMonthSnapshot.findUnique({
    where: { organizationId_year_month: { organizationId, year, month } },
  });
  if (!snapshot) return null;
  return parseSnapshotPayload(snapshot.payload);
}

export async function createPendingReconciliationImport(input: {
  organizationId: string;
  year: number;
  month: number;
  fileName: string;
  parsed: ReconciliationParseResult;
}): Promise<{
  importId: string;
  sheetName: string;
  rowCount: number;
  diff: DreReconciliationLineDiff[];
  unrecognizedFees: UnrecognizedFeeSummary[];
  warnings: ReconciliationParseWarning[];
}> {
  const aggregation = aggregateReconciliationRows(input.parsed.rows);
  const currentPayload = await loadMonthPayload(
    input.organizationId,
    input.year,
    input.month,
  );
  const diff = buildReconciliationDiff(currentPayload, aggregation);

  const importId = await prisma.$transaction(async (tx) => {
    await tx.dreReconciliationImport.deleteMany({
      where: {
        organizationId: input.organizationId,
        year: input.year,
        month: input.month,
        status: "pending",
      },
    });
    const created = await tx.dreReconciliationImport.create({
      data: {
        organizationId: input.organizationId,
        year: input.year,
        month: input.month,
        fileName: input.fileName,
        sheetName: input.parsed.sheetName,
        rowCount: input.parsed.rows.length,
        status: "pending",
        aggregationJson: asJson(aggregation),
        parseWarningsJson: asJson(input.parsed.warnings),
      },
    });
    const chunks: Prisma.DreReconciliationEntryCreateManyInput[] = [];
    for (const row of input.parsed.rows) {
      chunks.push({
        importId: created.id,
        organizationId: input.organizationId,
        rowIndex: row.rowIndex,
        operationDate: row.operationDate,
        operationId: row.operationId,
        operationType: row.operationType,
        operationStatus: row.operationStatus,
        sku: row.sku,
        itemTitle: row.itemTitle,
        quantity: row.quantity,
        grossValue:
          row.grossValue === null
            ? null
            : new Prisma.Decimal(row.grossValue.toFixed(2)),
        totalFees:
          row.totalFees === null
            ? null
            : new Prisma.Decimal(row.totalFees.toFixed(2)),
        totalPostpaidFees:
          row.totalPostpaidFees === null
            ? null
            : new Prisma.Decimal(row.totalPostpaidFees.toFixed(2)),
        sellerPaidShipping:
          row.sellerPaidShipping === null
            ? null
            : new Prisma.Decimal(row.sellerPaidShipping.toFixed(2)),
        mappedLineKey: null,
        mappedAmount: null,
        rawJson: asJson(row.raw),
      });
    }
    for (let i = 0; i < chunks.length; i += 500) {
      await tx.dreReconciliationEntry.createMany({
        data: chunks.slice(i, i + 500),
      });
    }
    return created.id;
  });

  return {
    importId,
    sheetName: input.parsed.sheetName,
    rowCount: input.parsed.rows.length,
    diff,
    unrecognizedFees: aggregation.unrecognizedFees,
    warnings: [...input.parsed.warnings, ...aggregation.warnings],
  };
}

function applyAggregationToPayload(
  payload: DreMonthSnapshotPayload,
  aggregation: ReconciliationLineAggregation,
  acceptedLineKeys: DreEditableLineKey[],
): DreMonthSnapshotPayload {
  let next = payload;
  for (const lineKey of acceptedLineKeys) {
    const amount = aggregation.amounts[lineKey];
    if (amount === undefined) continue;
    next = applyManualLineEdit(next, lineKey, amount);
    const field = BREAKDOWN_FIELD[lineKey];
    const items = aggregation.breakdowns[lineKey] as
      | DreLineBreakdownItem[]
      | undefined;
    if (field && items) {
      next = { ...next, [field]: items };
    }
  }
  return next;
}

export async function applyReconciliationImport(input: {
  organizationId: string;
  importId: string;
  acceptedLineKeys: DreEditableLineKey[];
}): Promise<{ year: Awaited<ReturnType<typeof loadDreYearView>> }> {
  const current = await prisma.dreReconciliationImport.findFirst({
    where: { id: input.importId, organizationId: input.organizationId },
  });
  if (!current || current.status !== "pending") {
    throw new Error("Importação de conciliação não encontrada ou já concluída.");
  }
  const aggregation = parseAggregation(current.aggregationJson);
  const existing = await prisma.dreMonthSnapshot.findUnique({
    where: {
      organizationId_year_month: {
        organizationId: input.organizationId,
        year: current.year,
        month: current.month,
      },
    },
  });
  const previousPayload =
    (existing ? parseSnapshotPayload(existing.payload) : null) ??
    emptyDreMonthSnapshotPayload();
  const nextPayload = applyAggregationToPayload(
    previousPayload,
    aggregation,
    input.acceptedLineKeys,
  );
  const syncedAt = existing?.syncedAt ?? new Date();

  await prisma.$transaction(async (tx) => {
    await tx.dreMonthSnapshot.upsert({
      where: {
        organizationId_year_month: {
          organizationId: input.organizationId,
          year: current.year,
          month: current.month,
        },
      },
      create: {
        organizationId: input.organizationId,
        year: current.year,
        month: current.month,
        syncedAt,
        payload: nextPayload as object,
      },
      update: { payload: nextPayload as object },
    });
    await tx.dreReconciliationImport.update({
      where: { id: current.id },
      data: {
        previousPayloadJson: asJson(previousPayload),
        acceptedLineKeysJson: asJson(input.acceptedLineKeys),
        appliedAt: new Date(),
      },
    });
  });

  return {
    year: await loadDreYearView(input.organizationId, current.year),
  };
}

export async function commitReconciliationImport(input: {
  organizationId: string;
  importId: string;
}): Promise<{ year: Awaited<ReturnType<typeof loadDreYearView>> }> {
  const current = await prisma.dreReconciliationImport.findFirst({
    where: { id: input.importId, organizationId: input.organizationId },
  });
  if (!current || current.status !== "pending" || !current.appliedAt) {
    throw new Error("Não há conciliação aplicada pendente para confirmar.");
  }
  const accepted = parseAcceptedKeys(current.acceptedLineKeysJson);
  const existing = await prisma.dreMonthSnapshot.findUnique({
    where: {
      organizationId_year_month: {
        organizationId: input.organizationId,
        year: current.year,
        month: current.month,
      },
    },
  });
  if (!existing) throw new Error("Snapshot do mês não encontrado.");
  const payload = parseSnapshotPayload(existing.payload);
  if (!payload) throw new Error("Snapshot inválido.");
  const committed = commitReconciledLinesAsTruth(payload, accepted);

  await prisma.$transaction(async (tx) => {
    await tx.dreMonthSnapshot.update({
      where: { id: existing.id },
      data: { payload: committed as object },
    });
    await tx.dreReconciliationImport.updateMany({
      where: {
        organizationId: input.organizationId,
        year: current.year,
        month: current.month,
        status: "confirmed",
      },
      data: { status: "superseded" },
    });
    await tx.dreReconciliationImport.update({
      where: { id: current.id },
      data: { status: "confirmed", confirmedAt: new Date() },
    });
  });

  return {
    year: await loadDreYearView(input.organizationId, current.year),
  };
}

export async function discardReconciliationImport(input: {
  organizationId: string;
  importId: string;
}): Promise<{ year: Awaited<ReturnType<typeof loadDreYearView>> }> {
  const current = await prisma.dreReconciliationImport.findFirst({
    where: { id: input.importId, organizationId: input.organizationId },
  });
  if (!current || current.status !== "pending") {
    throw new Error("Importação de conciliação não encontrada ou já concluída.");
  }
  const year = current.year;

  await prisma.$transaction(async (tx) => {
    if (current.appliedAt && current.previousPayloadJson) {
      const previous = parseSnapshotPayload(current.previousPayloadJson);
      if (previous) {
        await tx.dreMonthSnapshot.update({
          where: {
            organizationId_year_month: {
              organizationId: input.organizationId,
              year: current.year,
              month: current.month,
            },
          },
          data: { payload: previous as object },
        });
      }
    }
    await tx.dreReconciliationImport.delete({ where: { id: current.id } });
  });

  return { year: await loadDreYearView(input.organizationId, year) };
}
