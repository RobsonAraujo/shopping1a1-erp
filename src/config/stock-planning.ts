/**
 * Parâmetros para projeção de estoque e datas de reposição no painel.
 * Valores editáveis aqui; a UI usa estes números nos cálculos.
 */
export const stockPlanningConfig = {
  /**
   * Quantidade de dias (retroativos a partir de hoje) usada para calcular a
   * média diária de vendas: soma das unidades vendidas nesse intervalo ÷ este
   * número de dias. Ex.: 7 = basear a média nos últimos 7 dias.
   */
  salesAverageWindowDays: 7,

  /**
   * Prazo em dias entre o início do processo de reposição (busca, compra,
   * envio) e o momento em que o estoque novo fica disponível para venda.
   * Usado na coluna “A busca para agendamento precisa iniciar em”: essa data
   * fica esse número de dias antes do esgotamento previsto.
   */
  leadTimeDays: 14,

  /**
   * Quantos dias antes do esgotamento previsto o novo estoque deve já estar
   * ativo no anúncio (coluna “O novo estoque precisa entrar ativo em”).
   */
  activeStockBufferDays: 1,
} as const;

export type StockPlanningConfig = typeof stockPlanningConfig;
