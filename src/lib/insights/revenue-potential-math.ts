/**
 * Cálculo do potencial mensal compartilhado entre o loader (servidor) e a
 * simulação da tela (client). Sem dependência de servidor de propósito.
 */
import type { RevenuePotentialRow } from "@/lib/insights/types";

export const DAYS_IN_MONTH = 30;

/**
 * Potencial mensal de uma linha com a média/dia editada (ou não) na simulação.
 *
 * Não recalcula `média × 30 × price`: numa linha mesclada por SKU (anúncio
 * clássico + catálogo), o potencial do servidor soma cada anúncio com o próprio
 * preço, mas `price` é só o do anúncio canônico. Recalcular divergia do
 * servidor e deixava o gap negativo em produto vendendo. Com override, o
 * potencial escala na proporção da nova média (= preço médio ponderado).
 */
export function effectiveMonthlyPotential(
  row: Pick<
    RevenuePotentialRow,
    "price" | "dailyAvgEstimate" | "potentialMonthlyRevenue"
  >,
  override: number | undefined,
): number {
  if (override === undefined) return row.potentialMonthlyRevenue;
  if (row.dailyAvgEstimate > 0) {
    return row.potentialMonthlyRevenue * (override / row.dailyAvgEstimate);
  }
  return override * DAYS_IN_MONTH * row.price;
}
