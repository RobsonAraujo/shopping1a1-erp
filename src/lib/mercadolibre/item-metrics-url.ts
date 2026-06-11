/** Painel de métricas do ML com período "último mês" nativo da plataforma. */
export function buildMercadoLivreItemMetricsUrl(itemId: string): string {
  return `https://www.mercadolivre.com.br/metricas/${itemId}/performance-item?finish_period_evolutionary=lastPeriod&start_period_evolutionary=lastMonth`;
}
