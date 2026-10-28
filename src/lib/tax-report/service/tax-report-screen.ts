import { prisma } from "@/lib/db/db";
import { refreshDreSalesTax } from "@/lib/dre/dre-month-data";
import { logServerError } from "@/lib/infra/server-public-error";
import { impostoOperacionalTotalRelatorio } from "@/lib/tax-report/imposto-operacional";
import { recomputeTaxReportFromSavedSales } from "@/lib/tax-report/service/generate-monthly-report";
import { stripTransacoesForResponse } from "@/lib/tax-report/strip-transacoes-for-response";
import { repairTaxReportPayload } from "@/lib/tax-report/repair-snapshot-apuracao";
import {
  isLegacyTaxReport,
  taxReportOrdersFetchedAt,
} from "@/lib/tax-report/tax-report-meta";
import { taxReportStaleness } from "@/lib/tax-report/tax-report-staleness";
import type {
  TaxRecalcPreview,
  TaxReportDreFollowUp,
  TaxReportPayload,
  TaxReportScreenStatus,
} from "@/lib/tax-report/types";

/** Último `updatedAt` dos nivelamentos do DRE que cobrem o mês. */
async function loadLevelingUpdatedAt(
  organizationId: string,
  year: number,
  month: number,
): Promise<Date | null> {
  const row = await prisma.dreProductCostLeveling.findFirst({
    where: {
      organizationId,
      startDate: { lte: new Date(Date.UTC(year, month, 0)) },
      endDate: { gte: new Date(Date.UTC(year, month - 1, 1)) },
    },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });
  return row?.updatedAt ?? null;
}

/** O que o DRE do mês usa — só três campos do payload, sem as auditorias. */
async function loadDreTaxUsage(
  organizationId: string,
  year: number,
  month: number,
  reportGeneratedAt: Date,
): Promise<TaxReportScreenStatus["dre"]> {
  // `$queryRaw*` NÃO passa pelo tenant guard: filtro por organization_id obrigatório.
  const rows = await prisma.$queryRawUnsafe<
    Array<{ usedVersion: string | null; taxErp: string | null; manualEdit: boolean | null }>
  >(
    `select payload->'taxSource'->'report'->>'generatedAt' as "usedVersion",
            payload->>'taxErp' as "taxErp",
            coalesce(payload->'manuallyEditedLineKeys' @> '["taxErp"]'::jsonb, false) as "manualEdit"
     from dre_month_snapshots
     where organization_id = $1 and year = $2 and month = $3`,
    organizationId,
    year,
    month,
  );
  const row = rows[0];
  if (!row) return null;
  const taxErp = Number(row.taxErp ?? 0);
  return {
    usesThisVersion:
      row.usedVersion !== null &&
      Date.parse(row.usedVersion) === reportGeneratedAt.getTime(),
    taxErp: Number.isFinite(taxErp) ? taxErp : 0,
    manualEdit: Boolean(row.manualEdit),
  };
}

/**
 * Relatório do mês para a tela: o que ela mostra (com o reparo de exibição de
 * relatórios antigos) e o estado dele frente ao que está gravado e ao DRE.
 */
export async function loadTaxReportScreen(input: {
  organizationId: string;
  sellerId: number;
  year: number;
  month: number;
  now?: Date;
}): Promise<{ payload: TaxReportPayload; status: TaxReportScreenStatus } | null> {
  const row = await prisma.taxReportMonthSnapshot.findUnique({
    where: {
      sellerId_year_month: {
        sellerId: input.sellerId,
        year: input.year,
        month: input.month,
      },
    },
    select: { payload: true, payloadSummary: true, generatedAt: true },
  });
  if (!row) return null;

  const stored = row.payload as unknown as TaxReportPayload;
  const saved =
    (row.payloadSummary as unknown as TaxReportPayload | null) ?? stored;
  const [shown, levelingUpdatedAt, dre] = await Promise.all([
    repairTaxReportPayload(input.sellerId, stored),
    loadLevelingUpdatedAt(input.organizationId, input.year, input.month),
    loadDreTaxUsage(input.organizationId, input.year, input.month, row.generatedAt),
  ]);

  const savedTax = impostoOperacionalTotalRelatorio(saved);
  const savedRevenue = saved.consolidado.faturamento;
  const unsavedRecalc =
    Math.abs(impostoOperacionalTotalRelatorio(shown) - savedTax) > 1 ||
    Math.abs(shown.consolidado.faturamento - savedRevenue) > 1;

  return {
    payload: shown,
    status: {
      saved: {
        tax: savedTax,
        revenue: savedRevenue,
        generatedAt: row.generatedAt.toISOString(),
      },
      unsavedRecalc,
      staleness: taxReportStaleness({
        year: input.year,
        month: input.month,
        ordersFetchedAt: taxReportOrdersFetchedAt(saved.meta),
        generatedAt: row.generatedAt,
        legacy: isLegacyTaxReport(saved),
        levelingUpdatedAt,
        now: input.now,
      }),
      dre,
    },
  };
}

/**
 * Depois de recalcular o tributário, o imposto do DRE do mês acompanha (só
 * banco). Falha aqui não desfaz o relatório já salvo — volta como `failed`.
 */
export async function followUpDreTax(input: {
  organizationId: string;
  sellerId: number;
  year: number;
  month: number;
}): Promise<TaxReportDreFollowUp> {
  try {
    return await refreshDreSalesTax(
      input.organizationId,
      input.sellerId,
      input.year,
      input.month,
    );
  } catch (error) {
    logServerError("tax-report follow-up DRE tax", error);
    return { status: "failed", previousTaxErp: null, taxErp: null };
  }
}

/**
 * Prévia do recálculo com as vendas salvas — nada é gravado. Recalcular um mês
 * passado usa o cadastro e a configuração tributária de hoje (o nivelamento
 * vale para o período), então o número pode mudar bastante: a tela mostra o
 * antes → depois do tributário e do imposto do DRE antes de confirmar.
 */
export async function previewTaxReportRecompute(input: {
  organizationId: string;
  sellerId: number;
  year: number;
  month: number;
}): Promise<TaxRecalcPreview | null> {
  const [recomputed, row] = await Promise.all([
    recomputeTaxReportFromSavedSales(input),
    prisma.taxReportMonthSnapshot.findUnique({
      where: {
        sellerId_year_month: {
          sellerId: input.sellerId,
          year: input.year,
          month: input.month,
        },
      },
      select: { payload: true, payloadSummary: true },
    }),
  ]);
  if (!recomputed || !row) return null;
  const saved = (row.payloadSummary ?? row.payload) as unknown as TaxReportPayload;
  const dre = await refreshDreSalesTax(
    input.organizationId,
    input.sellerId,
    input.year,
    input.month,
    { dryRun: true, monthReportOverride: stripTransacoesForResponse(recomputed) },
  );
  return {
    report: {
      before: {
        tax: impostoOperacionalTotalRelatorio(saved),
        revenue: saved.consolidado.faturamento,
      },
      after: {
        tax: impostoOperacionalTotalRelatorio(recomputed),
        revenue: recomputed.consolidado.faturamento,
      },
    },
    dre,
  };
}
