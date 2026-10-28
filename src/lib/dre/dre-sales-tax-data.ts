import { getCompanySettings } from "@/lib/products/product-data";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import {
  impostoOperacionalTotalRelatorio,
  skuImpostoOperacionalTaxaExata,
} from "@/lib/tax-report/imposto-operacional";
import {
  isLegacyTaxReport,
  taxReportOrdersFetchedAt,
} from "@/lib/tax-report/tax-report-meta";
import type { TaxReportPayload } from "@/lib/tax-report/types";
import type { DreTaxRateEntry, DreTaxRates } from "@/lib/dre/dre-sales-tax";

/** Meses de relatório lidos para achar o % de anúncios que não venderam no mês. */
const RECENT_REPORTS_LIMIT = 12;

/**
 * Monta o lookup de % para o imposto do DRE a partir dos relatórios
 * tributários salvos (só o resumo — sem o detalhe por venda) até o próprio mês.
 * Nunca usa relatório de mês posterior: o % de hoje não reescreve o passado.
 */
export function buildDreTaxRates(input: {
  year: number;
  month: number;
  regime: DreTaxRates["regime"];
  simplesRatePercent: number | null;
  /** Do mais recente ao mais antigo, todos <= (year, month). */
  reports: readonly TaxReportPayload[];
}): DreTaxRates {
  const byMlItemId = new Map<string, DreTaxRateEntry>();
  const bySku = new Map<string, DreTaxRateEntry>();
  for (const report of input.reports) {
    for (const row of report.porSku) {
      const entry: DreTaxRateEntry = {
        ratePercent: skuImpostoOperacionalTaxaExata(row),
        year: report.year,
        month: report.month,
      };
      if (row.mlItemId && !byMlItemId.has(row.mlItemId)) {
        byMlItemId.set(row.mlItemId, entry);
      }
      for (const sku of [row.sku, ...(row.skuAliases ?? [])]) {
        const key = normalizeProductSku(sku);
        if (key && !bySku.has(key)) bySku.set(key, entry);
      }
    }
  }

  const monthReport = input.reports.find(
    (report) => report.year === input.year && report.month === input.month,
  );
  return {
    year: input.year,
    month: input.month,
    regime: input.regime,
    simplesRatePercent: input.simplesRatePercent,
    byMlItemId,
    bySku,
    report: monthReport
      ? {
          generatedAt: monthReport.meta.geradoEm,
          ordersFetchedAt: taxReportOrdersFetchedAt(monthReport.meta),
          revenue: monthReport.consolidado.faturamento,
          tax: impostoOperacionalTotalRelatorio(monthReport),
          orderCount: monthReport.meta.pedidosProcessados,
          legacy: isLegacyTaxReport(monthReport),
        }
      : null,
  };
}

/**
 * `sellerId` porque os relatórios tributários são por conta ML. No Simples não
 * existe relatório: o % é a alíquota efetiva do DAS configurada (mesma regra da
 * Lucratividade).
 */
export async function loadDreTaxRates(
  organizationId: string,
  sellerId: number,
  year: number,
  month: number,
  options: {
    /**
     * Relatório do mês ainda não gravado (prévia de um recálculo): entra no
     * lugar do salvo, para mostrar o imposto do DRE antes de confirmar.
     */
    monthReportOverride?: TaxReportPayload;
  } = {},
): Promise<DreTaxRates> {
  const settings = await getCompanySettings(organizationId);
  if (settings.taxRegime === "SIMPLES") {
    return buildDreTaxRates({
      year,
      month,
      regime: "SIMPLES",
      simplesRatePercent: settings.simplesAliquotaEfetivaPercent,
      reports: [],
    });
  }
  const { loadRecentTaxReportSummariesUpTo } = await import(
    "@/lib/tax-report/service/generate-monthly-report"
  );
  const saved = await loadRecentTaxReportSummariesUpTo(
    sellerId,
    year,
    month,
    RECENT_REPORTS_LIMIT,
  );
  const override = options.monthReportOverride;
  const reports = override
    ? [
        override,
        ...saved.filter(
          (report) => !(report.year === year && report.month === month),
        ),
      ]
    : saved;
  return buildDreTaxRates({
    year,
    month,
    regime: "LUCRO_REAL",
    simplesRatePercent: null,
    reports,
  });
}
