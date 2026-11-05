export const dashboardSummaryConfig = {
  /** Dias antes do fim da promoção para alertar no painel Resumo. */
  promotionExpiringSoonDays: 3,
  /** Timezone para comparar datas de término de promoção ML. */
  promotionTimezone: "America/Sao_Paulo",
  /** Anúncios próprios entram na varredura de promoções por padrão. */
  promotionMonitorOwnListings: true,
  /** Catálogo fica de fora por padrão: soma uma chamada ao ML por anúncio. */
  promotionMonitorCatalogListings: false,
  /**
   * Tempo máximo da varredura. Passou disso, devolve o que já tem com um aviso, em
   * vez de consumir o `maxDuration` inteiro da rota sob throttling do ML.
   */
  promotionScanBudgetMs: 60_000,
  /** Teto da lista "sem promoção". O total real vai em `withoutPromotionCount`. */
  promotionWithoutListMax: 200,
} as const;

/**
 * Rota do resumo de promoções, que também é a chave do cache por aba do widget.
 * Configurações precisa dela para invalidar esse cache ao salvar.
 */
export const PROMOTION_SUMMARY_ENDPOINT = "/api/dashboard/summary/promotions";

export type DashboardSummaryConfig = typeof dashboardSummaryConfig;
