import { prisma } from "@/lib/db/db";
import { repairTaxReportPayload } from "@/lib/tax-report/repair-snapshot-apuracao";
import { slimTaxReportPayloadForStorage } from "@/lib/tax-report/service/snapshot-storage";
import { stripTransacoesForResponse } from "@/lib/tax-report/strip-transacoes-for-response";
import type { TaxReportPayload } from "@/lib/tax-report/types";

const SCENARIO_LUCRO_REAL = "LUCRO_REAL";

/**
 * Persistência do snapshot de simulação — tabela fisicamente separada de
 * `TaxReportMonthSnapshot` (nunca lida por Produtos/Lucratividade/DRE). Ver
 * `TaxReportSimulationSnapshot` no schema.
 */
export async function saveTaxReportSimulationSnapshot(
  organizationId: string,
  sellerId: number,
  payload: TaxReportPayload,
): Promise<void> {
  const slim = slimTaxReportPayloadForStorage(payload);
  const summary = stripTransacoesForResponse(payload);
  await prisma.taxReportSimulationSnapshot.upsert({
    where: {
      organizationId_sellerId_year_month_scenario: {
        organizationId,
        sellerId,
        year: payload.year,
        month: payload.month,
        scenario: SCENARIO_LUCRO_REAL,
      },
    },
    create: {
      organizationId,
      sellerId,
      year: payload.year,
      month: payload.month,
      scenario: SCENARIO_LUCRO_REAL,
      generatedAt: new Date(payload.meta.geradoEm),
      payload: slim as object,
      payloadSummary: summary as object,
    },
    update: {
      generatedAt: new Date(payload.meta.geradoEm),
      payload: slim as object,
      payloadSummary: summary as object,
    },
  });
}

export async function loadTaxReportSimulationSnapshot(
  organizationId: string,
  sellerId: number,
  year: number,
  month: number,
): Promise<TaxReportPayload | null> {
  const row = await prisma.taxReportSimulationSnapshot.findUnique({
    where: {
      organizationId_sellerId_year_month_scenario: {
        organizationId,
        sellerId,
        year,
        month,
        scenario: SCENARIO_LUCRO_REAL,
      },
    },
  });
  if (!row) return null;
  const payload = row.payload as unknown as TaxReportPayload;
  return repairTaxReportPayload(sellerId, payload);
}
