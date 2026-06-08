/**
 * Parâmetros para análise de compra por fornecedor.
 */
export const purchaseAnalysisConfig = {
  /** Dias de cobertura alvo além dos prazos operacionais (compra + Full). */
  targetCoverageBufferDays: 30,

  /** Cobertura acima disso com vendas baixas indica evitar reposição. */
  lowRotationCoverageDays: 60,

  /** Vendas na janela para classificar rotação como alta. */
  highRotationUnitsSold: 7,

  /** Média diária mínima para rotação alta. */
  highRotationDailyAvg: 0.5,
} as const;

export type PurchaseAnalysisConfig = typeof purchaseAnalysisConfig;
