import { roundMoney } from "@/lib/pricing/financial-margin";

/**
 * PMA (preço mínimo anunciável, cadastrado em Meus produtos) é um piso: o
 * problema é anunciar abaixo dele. Uma conta só para a tarefa "Subir para o
 * PMA", o simulador (Calculadora e Ações do dia) e a faixa "Agora". Puro.
 */

/** Quanto falta para o PMA (R$), ou `null` se o preço está no PMA, acima ou não há PMA. */
export function belowPmaBy(price: number, pmaPrice: number | null | undefined): number | null {
  if (pmaPrice === null || pmaPrice === undefined || pmaPrice <= 0) return null;
  if (price >= pmaPrice - 0.005) return null;
  return roundMoney(pmaPrice - price);
}
