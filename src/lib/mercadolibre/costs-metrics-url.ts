import {
  formatCalendarRangeYmd,
  getCalendarMonthRange,
} from "./revenue-periods";

/**
 * Painel "Tarifas e investimentos" do ML, aba de rentabilidade, filtrado pelo
 * mês civil informado. Ali o usuário encontra a linha "Outras Tarifas" — ao
 * passar o mouse, o ML mostra o valor exato que alimenta "Tarifas especiais"
 * no DRE (a fatura consolidada não detalha esse valor por si só).
 */
export function buildMercadoLivreCostsMetricsUrl(
  year: number,
  month: number,
): string {
  const range = formatCalendarRangeYmd(getCalendarMonthRange(year, month));
  const from = `${range.from}T04:00:00.000Z`;
  const to = `${range.to}T04:00:00.000Z`;
  return (
    "https://vendedores.mercadolivre.com.br/metricas/custos" +
    `?active_tab=profitability&from_current=${from}&start_period=custom&to_current=${to}`
  );
}
