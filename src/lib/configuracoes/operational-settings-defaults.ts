import {
  stockPlanningConfig,
  type StockPlanningValues,
} from "@/config/stock-planning";
import {
  purchaseAnalysisConfig,
  type PurchaseAnalysisValues,
} from "@/config/purchase-analysis";
import { dashboardSummaryConfig } from "@/config/dashboard-summary";

/**
 * Parâmetros operacionais que o usuário pode customizar em
 * Configurações > Planejamento. Cada valor tem um default de código (os
 * arquivos em `src/config/`) usado quando a organização nunca salvou nada.
 *
 * Sem dependências de servidor (Prisma/`pg`) de propósito — importado por
 * `operational-settings-client.tsx` ("use client"). A leitura/escrita no
 * banco fica em `@/lib/operational-settings` (server-only).
 */
export type OperationalSettingsValues = {
  salesAverageWindowDays: number;
  leadTimeDays: number;
  activeStockBufferDays: number;
  targetCoverageBufferDays: number;
  rotationHighDailyAvg: number;
  rotationMediumDailyAvg: number;
  promotionExpiringSoonDays: number;
};

export const OPERATIONAL_SETTINGS_DEFAULTS: OperationalSettingsValues = {
  salesAverageWindowDays: stockPlanningConfig.salesAverageWindowDays,
  leadTimeDays: stockPlanningConfig.leadTimeDays,
  activeStockBufferDays: stockPlanningConfig.activeStockBufferDays,
  targetCoverageBufferDays: purchaseAnalysisConfig.targetCoverageBufferDays,
  rotationHighDailyAvg: purchaseAnalysisConfig.rotationDailyAvg.altaMin,
  rotationMediumDailyAvg: purchaseAnalysisConfig.rotationDailyAvg.mediaMin,
  promotionExpiringSoonDays: dashboardSummaryConfig.promotionExpiringSoonDays,
};

/** Converte para o formato aceito por `computeStockPlanningDisplay`/`buildPurchasePlan`. */
export function toStockPlanningValues(
  settings: OperationalSettingsValues,
): StockPlanningValues {
  return {
    salesAverageWindowDays: settings.salesAverageWindowDays,
    leadTimeDays: settings.leadTimeDays,
    activeStockBufferDays: settings.activeStockBufferDays,
    salesWindowDateField: stockPlanningConfig.salesWindowDateField,
  };
}

/** Converte para o formato aceito por `computePurchaseAnalysis`. */
export function toPurchaseAnalysisValues(
  settings: OperationalSettingsValues,
): PurchaseAnalysisValues {
  return {
    targetCoverageBufferDays: settings.targetCoverageBufferDays,
    rotationDailyAvg: {
      altaMin: settings.rotationHighDailyAvg,
      mediaMin: settings.rotationMediumDailyAvg,
    },
  };
}
