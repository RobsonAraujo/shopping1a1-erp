import { roundMoney } from "@/lib/financial-margin";
import type { CreditoOutrasDespesasBreakdown } from "@/lib/tax-report/types";

/** Alíquota de crédito PIS/COFINS não-cumulativo sobre tarifa de venda do Meli. */
export const MELI_FEE_CREDIT_RATE = 0.0925;
/** Alíquota de crédito PIS/COFINS não-cumulativo sobre gasto em ADS (Product Ads). */
export const ADS_CREDIT_RATE = 0.0925;

export function calcularCreditoMeliFee(saleFee: number): {
  base: number;
  aliquotaPercent: number;
  credito: number;
} {
  const base = Number.isFinite(saleFee) && saleFee > 0 ? saleFee : 0;
  return {
    base: roundMoney(base),
    aliquotaPercent: MELI_FEE_CREDIT_RATE * 100,
    credito: roundMoney(base * MELI_FEE_CREDIT_RATE),
  };
}

/**
 * Crédito sobre gasto em ADS: rateia o gasto total do anúncio no mês
 * proporcionalmente à receita desta venda dentro da receita total do
 * anúncio no mês — equivalente a creditar 9,25% sobre a "média de gasto
 * de ads por venda" do anúncio.
 */
export function calcularCreditoAds(input: {
  receitaBrutaVenda: number;
  receitaTotalItemMes: number;
  gastoAdsTotalItemMes: number;
}): {
  base: number;
  aliquotaPercent: number;
  credito: number;
  gastoAdsMesItem: number;
  receitaMesItem: number;
} {
  const { receitaBrutaVenda, receitaTotalItemMes, gastoAdsTotalItemMes } = input;
  if (!(receitaTotalItemMes > 0) || !(gastoAdsTotalItemMes > 0)) {
    return {
      base: 0,
      aliquotaPercent: ADS_CREDIT_RATE * 100,
      credito: 0,
      gastoAdsMesItem: gastoAdsTotalItemMes > 0 ? roundMoney(gastoAdsTotalItemMes) : 0,
      receitaMesItem: receitaTotalItemMes > 0 ? roundMoney(receitaTotalItemMes) : 0,
    };
  }
  const proporcao = receitaBrutaVenda / receitaTotalItemMes;
  const gastoAdsRateado = roundMoney(proporcao * gastoAdsTotalItemMes);
  return {
    base: gastoAdsRateado,
    aliquotaPercent: ADS_CREDIT_RATE * 100,
    credito: roundMoney(gastoAdsRateado * ADS_CREDIT_RATE),
    gastoAdsMesItem: roundMoney(gastoAdsTotalItemMes),
    receitaMesItem: roundMoney(receitaTotalItemMes),
  };
}

export function calcularCreditoOutrasDespesas(input: {
  saleFee: number;
  receitaBrutaVenda: number;
  receitaTotalItemMes: number;
  gastoAdsTotalItemMes: number;
}): CreditoOutrasDespesasBreakdown {
  const meliFee = calcularCreditoMeliFee(input.saleFee);
  const ads = calcularCreditoAds(input);
  return {
    meliFee,
    ads,
    creditoTotal: roundMoney(meliFee.credito + ads.credito),
  };
}

export function buildCreditoOutrasDespesasMemoria(
  result: CreditoOutrasDespesasBreakdown,
): string[] {
  const lines: string[] = [];
  if (result.meliFee.base > 0) {
    lines.push(
      `Tarifa Meli (sale_fee): R$ ${result.meliFee.base.toFixed(2)} × ${result.meliFee.aliquotaPercent.toFixed(2)}% = R$ ${result.meliFee.credito.toFixed(2)}`,
    );
  }
  if (result.ads.receitaMesItem > 0) {
    lines.push(
      `Gasto ADS no mês (anúncio): R$ ${result.ads.gastoAdsMesItem.toFixed(2)} / Receita do anúncio no mês: R$ ${result.ads.receitaMesItem.toFixed(2)} → rateio desta venda: R$ ${result.ads.base.toFixed(2)} × ${result.ads.aliquotaPercent.toFixed(2)}% = R$ ${result.ads.credito.toFixed(2)}`,
    );
  }
  lines.push(
    `(=) Crédito outras despesas (Meli + ADS): R$ ${result.creditoTotal.toFixed(2)}`,
  );
  return lines;
}
