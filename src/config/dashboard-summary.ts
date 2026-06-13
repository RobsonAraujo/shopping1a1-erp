export const dashboardSummaryConfig = {
  /** Dias antes do fim da promoção para alertar no painel Resumo. */
  promotionExpiringSoonDays: 3,
  /** Timezone para comparar datas de término de promoção ML. */
  promotionTimezone: "America/Sao_Paulo",
} as const;

export type DashboardSummaryConfig = typeof dashboardSummaryConfig;
