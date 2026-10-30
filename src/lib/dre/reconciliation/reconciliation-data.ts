import { Prisma } from "@/generated/prisma";
import type { DreReconciliationImport } from "@/generated/prisma";
import { prisma } from "@/lib/db/db";
import {
  applyReconciliationToPayload,
  applyRestoreLineFromSync,
  getEditableLineAmount,
  isDreEditableLineKey,
  mlDifalCountsAsFee,
  type DreEditableLineKey,
  type DreMonthSnapshotPayload,
} from "@/lib/dre/dre-calculations";
import {
  emptyDreMonthSnapshotPayload,
  parseSnapshotPayload,
} from "@/lib/dre/dre-month-data";
import { loadDreYearView } from "@/lib/dre/dre-year-data";
import { getCompanySettings } from "@/lib/products/product-data";
import { aggregateReconciliationRows } from "@/lib/dre/reconciliation/aggregate";
import { assertSheetMatchesMonth } from "@/lib/dre/reconciliation/sheet-period";
import {
  compareReconciliation,
  resolveReconciledLineKeys,
} from "@/lib/dre/reconciliation/diff";
import type {
  DreReconciliationReview,
  ReconciliationLineAggregation,
  ReconciliationParseResult,
  ReconciliationParseWarning,
} from "@/lib/dre/reconciliation/types";

/**
 * Ciclo de vida de um import (`DreReconciliationImport.status`):
 *
 * - `pending` sem `appliedAt` → prévia (rascunho). Nunca mexeu no snapshot;
 *   é apagada ao cancelar, ao subir outra planilha do mês ou ao confirmar outra.
 * - `confirmed` → conciliação do mês. O snapshot carrega `payload.reconciliation`
 *   com o mesmo `importId`, e o sync reaplica esses valores.
 * - `superseded` → histórico (substituída por outra conciliação, ou descartada
 *   num sync sem manter).
 *
 * Legado do fluxo de dois passos: `pending` com `appliedAt` (aplicado e nunca
 * salvo) e `confirmed` sem marca no snapshot (conciliação que o sync antigo
 * apagou). Os dois aparecem como "revisar" e se resolvem pelo mesmo
 * `confirmReconciliationImport` / `discardReconciliationImport`.
 */

type ImportRow = DreReconciliationImport;

/** Erro de regra com mensagem pronta para o usuário (rota responde 400). */
export class DreReconciliationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DreReconciliationError";
  }
}

const NOT_FOUND_MESSAGE =
  "Esta conciliação não existe mais ou já foi substituída. Recarregue o DRE.";

function asJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function parseAggregation(raw: unknown): ReconciliationLineAggregation {
  const value = (raw ?? {}) as Partial<ReconciliationLineAggregation>;
  return {
    amounts: value.amounts ?? {},
    breakdowns: value.breakdowns ?? {},
    unrecognizedFees: value.unrecognizedFees ?? [],
    excludedFees: value.excludedFees ?? [],
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

function parseWarnings(raw: unknown): ReconciliationParseWarning[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (item): item is ReconciliationParseWarning =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as ReconciliationParseWarning).code === "string",
  );
}

/** Import salvo pelo fluxo antigo que ainda precisa de revisão. */
function isLegacyImport(
  row: Pick<ImportRow, "id" | "status" | "appliedAt">,
  payload: DreMonthSnapshotPayload | null,
): boolean {
  if (row.status === "pending") return row.appliedAt !== null;
  if (row.status === "confirmed") {
    return payload?.reconciliation?.importId !== row.id;
  }
  return false;
}

/**
 * Chaves candidatas da comparação. No legado, só o que o usuário aceitou na
 * época (filtrado depois pelas linhas governadas — imports antigos chegaram a
 * aceitar ADS/faturamento). Na prévia nova, todas as linhas da planilha.
 */
function candidateKeysFor(
  row: Pick<ImportRow, "id" | "status" | "appliedAt" | "acceptedLineKeysJson">,
  payload: DreMonthSnapshotPayload | null,
): DreEditableLineKey[] | undefined {
  return isLegacyImport(row, payload)
    ? parseAcceptedKeys(row.acceptedLineKeysJson)
    : undefined;
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

function buildReview(
  row: ImportRow,
  payload: DreMonthSnapshotPayload | null,
  aggregation: ReconciliationLineAggregation,
  extraWarnings: ReconciliationParseWarning[] = [],
): DreReconciliationReview {
  const comparison = compareReconciliation(
    payload,
    aggregation,
    candidateKeysFor(row, payload),
  );
  return {
    importId: row.id,
    month: row.month,
    fileName: row.fileName,
    sheetName: row.sheetName,
    rowCount: row.rowCount,
    status: row.status === "confirmed" ? "confirmed" : "pending",
    legacy: isLegacyImport(row, payload),
    diff: comparison.diff,
    matched: comparison.matched,
    unrecognizedFees: aggregation.unrecognizedFees,
    excludedFees: aggregation.excludedFees,
    warnings: [
      ...extraWarnings,
      ...parseWarnings(row.parseWarningsJson),
      ...aggregation.warnings,
    ],
  };
}

export async function createPendingReconciliationImport(input: {
  organizationId: string;
  year: number;
  month: number;
  fileName: string;
  parsed: ReconciliationParseResult;
}): Promise<DreReconciliationReview> {
  assertSheetMatchesMonth(input.parsed.rows, input.year, input.month);
  const [settings, currentPayload] = await Promise.all([
    getCompanySettings(input.organizationId),
    loadMonthPayload(input.organizationId, input.year, input.month),
  ]);
  const aggregation = aggregateReconciliationRows(input.parsed.rows, {
    difalCountsAsFee: mlDifalCountsAsFee(
      settings.taxRegime === "SIMPLES" ? "SIMPLES" : "LUCRO_REAL",
    ),
  });

  const created = await prisma.$transaction(async (tx) => {
    // Só rascunhos: um `pending` já aplicado (legado) carrega histórico e é
    // resolvido quando esta prévia for confirmada.
    await tx.dreReconciliationImport.deleteMany({
      where: {
        organizationId: input.organizationId,
        year: input.year,
        month: input.month,
        status: "pending",
        appliedAt: null,
      },
    });
    const row = await tx.dreReconciliationImport.create({
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
    for (const parsedRow of input.parsed.rows) {
      chunks.push({
        importId: row.id,
        organizationId: input.organizationId,
        rowIndex: parsedRow.rowIndex,
        operationDate: parsedRow.operationDate,
        operationId: parsedRow.operationId,
        operationType: parsedRow.operationType,
        operationStatus: parsedRow.operationStatus,
        sku: parsedRow.sku,
        itemTitle: parsedRow.itemTitle,
        quantity: parsedRow.quantity,
        grossValue:
          parsedRow.grossValue === null
            ? null
            : new Prisma.Decimal(parsedRow.grossValue.toFixed(2)),
        totalFees:
          parsedRow.totalFees === null
            ? null
            : new Prisma.Decimal(parsedRow.totalFees.toFixed(2)),
        totalPostpaidFees:
          parsedRow.totalPostpaidFees === null
            ? null
            : new Prisma.Decimal(parsedRow.totalPostpaidFees.toFixed(2)),
        sellerPaidShipping:
          parsedRow.sellerPaidShipping === null
            ? null
            : new Prisma.Decimal(parsedRow.sellerPaidShipping.toFixed(2)),
        mappedLineKey: null,
        mappedAmount: null,
        rawJson: asJson(parsedRow.raw),
      });
    }
    for (let i = 0; i < chunks.length; i += 500) {
      await tx.dreReconciliationEntry.createMany({
        data: chunks.slice(i, i + 500),
      });
    }
    return row;
  }, { timeout: 120_000 });

  return buildReview(created, currentPayload, aggregation);
}

/** Revisão de um import já salvo (prévia aberta de novo ou legado). */
export async function getReconciliationReview(input: {
  organizationId: string;
  importId: string;
}): Promise<DreReconciliationReview> {
  const row = await prisma.dreReconciliationImport.findFirst({
    where: { id: input.importId, organizationId: input.organizationId },
  });
  if (!row || row.status === "superseded") {
    throw new DreReconciliationError(NOT_FOUND_MESSAGE);
  }
  const payload = await loadMonthPayload(
    input.organizationId,
    row.year,
    row.month,
  );
  return buildReview(row, payload, parseAggregation(row.aggregationJson));
}

/**
 * Conciliação em um passo: grava os valores da planilha nas linhas governadas
 * (as que já conferiam + as divergentes aceitas), marca o mês como conciliado e
 * aposenta qualquer outra conciliação do mês — tudo numa transação, lendo o
 * snapshot dentro dela.
 */
export async function confirmReconciliationImport(input: {
  organizationId: string;
  importId: string;
  acceptedLineKeys: DreEditableLineKey[];
}): Promise<{ year: Awaited<ReturnType<typeof loadDreYearView>> }> {
  const { organizationId } = input;
  const year = await prisma.$transaction(
    async (tx) => {
      const row = await tx.dreReconciliationImport.findFirst({
        where: { id: input.importId, organizationId },
      });
      if (!row || row.status === "superseded") {
        throw new DreReconciliationError(NOT_FOUND_MESSAGE);
      }
      const where = {
        organizationId_year_month: {
          organizationId,
          year: row.year,
          month: row.month,
        },
      };
      const existing = await tx.dreMonthSnapshot.findUnique({ where });
      const previousPayload =
        (existing ? parseSnapshotPayload(existing.payload) : null) ??
        emptyDreMonthSnapshotPayload();
      const aggregation = parseAggregation(row.aggregationJson);
      const comparison = compareReconciliation(
        existing ? previousPayload : null,
        aggregation,
        candidateKeysFor(row, existing ? previousPayload : null),
      );
      const lineKeys = resolveReconciledLineKeys(
        comparison,
        input.acceptedLineKeys,
      );
      if (lineKeys.length === 0) {
        throw new DreReconciliationError(
          "Nenhuma linha da planilha seria conciliada. Marque ao menos uma linha.",
        );
      }

      const now = new Date();
      const nextPayload = applyReconciliationToPayload(
        previousPayload,
        aggregation,
        lineKeys,
        {
          importId: row.id,
          reconciledAt: now.toISOString(),
          fileName: row.fileName,
        },
      );

      await tx.dreMonthSnapshot.upsert({
        where,
        create: {
          organizationId,
          year: row.year,
          month: row.month,
          syncedAt: now,
          payload: nextPayload as object,
        },
        update: { payload: nextPayload as object },
      });

      const sameMonth = {
        organizationId,
        year: row.year,
        month: row.month,
        id: { not: row.id },
      };
      await tx.dreReconciliationImport.deleteMany({
        where: { ...sameMonth, status: "pending", appliedAt: null },
      });
      await tx.dreReconciliationImport.updateMany({
        where: {
          ...sameMonth,
          OR: [
            { status: "confirmed" },
            { status: "pending", appliedAt: { not: null } },
          ],
        },
        data: { status: "superseded" },
      });
      await tx.dreReconciliationImport.update({
        where: { id: row.id },
        data: {
          status: "confirmed",
          appliedAt: row.appliedAt ?? now,
          confirmedAt: now,
          acceptedLineKeysJson: asJson(lineKeys),
          previousPayloadJson: asJson(previousPayload),
        },
      });
      return row.year;
    },
    { timeout: 60_000 },
  );

  return { year: await loadDreYearView(organizationId, year) };
}

/**
 * Descarta sem tocar no que não é da conciliação:
 * - prévia: só apaga;
 * - legado aplicado e não salvo: devolve ao baseline **linha a linha** só o que
 *   ainda é exatamente o valor da planilha (um sync posterior já pode ter
 *   trocado o resto — restaurar o payload inteiro desfaria esse sync);
 * - confirmada: mês deixa de estar conciliado; valores ficam como estão.
 */
export async function discardReconciliationImport(input: {
  organizationId: string;
  importId: string;
}): Promise<{ year: Awaited<ReturnType<typeof loadDreYearView>> }> {
  const { organizationId } = input;
  const year = await prisma.$transaction(
    async (tx) => {
      const row = await tx.dreReconciliationImport.findFirst({
        where: { id: input.importId, organizationId },
      });
      if (!row || row.status === "superseded") {
        throw new DreReconciliationError(NOT_FOUND_MESSAGE);
      }
      const where = {
        organizationId_year_month: {
          organizationId,
          year: row.year,
          month: row.month,
        },
      };

      if (row.status === "pending" && row.appliedAt === null) {
        await tx.dreReconciliationImport.delete({ where: { id: row.id } });
        return row.year;
      }

      const existing = await tx.dreMonthSnapshot.findUnique({ where });
      const payload = existing ? parseSnapshotPayload(existing.payload) : null;

      if (row.status === "pending") {
        if (payload) {
          const aggregation = parseAggregation(row.aggregationJson);
          let next = payload;
          for (const key of parseAcceptedKeys(row.acceptedLineKeysJson)) {
            const proposed = aggregation.amounts[key];
            if (proposed === undefined) continue;
            if (!(next.manuallyEditedLineKeys ?? []).includes(key)) continue;
            if (Math.abs(getEditableLineAmount(next, key) - proposed) >= 0.005) {
              continue;
            }
            next = applyRestoreLineFromSync(next, key) ?? next;
          }
          if (next !== payload) {
            await tx.dreMonthSnapshot.update({
              where,
              data: { payload: next as object },
            });
          }
        }
        await tx.dreReconciliationImport.delete({ where: { id: row.id } });
        return row.year;
      }

      if (payload?.reconciliation?.importId === row.id) {
        const next = { ...payload };
        delete next.reconciliation;
        await tx.dreMonthSnapshot.update({
          where,
          data: { payload: next as object },
        });
      }
      await tx.dreReconciliationImport.update({
        where: { id: row.id },
        data: { status: "superseded" },
      });
      return row.year;
    },
    { timeout: 60_000 },
  );

  return { year: await loadDreYearView(organizationId, year) };
}
