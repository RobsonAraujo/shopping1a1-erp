/**
 * Parâmetros para análise de compra por fornecedor.
 */
export const purchaseAnalysisConfig = {
  /** Dias de cobertura alvo além dos prazos operacionais (compra + Full). */
  targetCoverageBufferDays: 30,

  /** Limites de média diária (vendas na janela ÷ dias da janela) para rotação. */
  rotationDailyAvg: {
    /** Alta: média ≥ este valor (vendas/dia). */
    altaMin: 7,
    /** Média: entre mediaMin e altaMin (3–6/dia). */
    mediaMin: 3,
  },
} as const;

export type PurchaseAnalysisConfig = typeof purchaseAnalysisConfig;

/**
 * Mesmo formato de `PurchaseAnalysisConfig`, mas com tipos "largos"
 * (`number` em vez de literais). Usar em funções que recebem valores
 * carregados em runtime (config da organização em
 * `src/lib/operational-settings.ts`).
 */
export type PurchaseAnalysisValues = {
  targetCoverageBufferDays: number;
  rotationDailyAvg: {
    altaMin: number;
    mediaMin: number;
  };
};
