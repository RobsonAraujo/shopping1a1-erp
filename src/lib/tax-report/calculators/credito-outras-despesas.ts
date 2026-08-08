import { roundMoney } from "@/lib/financial-margin";
import { FIXED_COST_CREDIT_RATE } from "@/lib/tax-report/fixed-cost-credit";
import type { CreditoOutrasDespesasBreakdown } from "@/lib/tax-report/types";

/** Alíquota de crédito PIS/COFINS não-cumulativo sobre tarifa de venda do Meli. */
export const MELI_FEE_CREDIT_RATE = 0.0925;
/** Alíquota de crédito PIS/COFINS não-cumulativo sobre gasto em ADS (Product Ads). */
export const ADS_CREDIT_RATE = 0.0925;
/** Alíquota de crédito PIS/COFINS não-cumulativo sobre frete pago pela empresa na venda. */
export const FREIGHT_CREDIT_RATE = 0.0925;

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

/** Crédito sobre frete pago pela empresa na venda — já rateado por linha na origem (build-transacao-venda.ts). */
export function calcularCreditoFrete(freightCost: number): {
  base: number;
  aliquotaPercent: number;
  credito: number;
} {
  const base = Number.isFinite(freightCost) && freightCost > 0 ? freightCost : 0;
  return {
    base: roundMoney(base),
    aliquotaPercent: FREIGHT_CREDIT_RATE * 100,
    credito: roundMoney(base * FREIGHT_CREDIT_RATE),
  };
}

/**
 * Crédito sobre custos fixos cadastrados (ex.: aluguel): rateia o total do
 * mês (já reduzido pelos dias corridos se o mês estiver em andamento — ver
 * `resolveFixedCostCreditForMonth`) proporcionalmente à receita desta venda
 * dentro da receita total do mês inteiro (não por anúncio, diferente do ADS).
 */
export function calcularCreditoCustosFixosRateado(input: {
  receitaBrutaVenda: number;
  receitaTotalMes: number;
  custosFixosBaseMes: number;
}): {
  base: number;
  aliquotaPercent: number;
  credito: number;
  custosFixosMesTotal: number;
  receitaMesTotal: number;
} {
  const { receitaBrutaVenda, receitaTotalMes, custosFixosBaseMes } = input;
  if (!(receitaTotalMes > 0) || !(custosFixosBaseMes > 0)) {
    return {
      base: 0,
      aliquotaPercent: FIXED_COST_CREDIT_RATE * 100,
      credito: 0,
      custosFixosMesTotal: custosFixosBaseMes > 0 ? roundMoney(custosFixosBaseMes) : 0,
      receitaMesTotal: receitaTotalMes > 0 ? roundMoney(receitaTotalMes) : 0,
    };
  }
  const proporcao = receitaBrutaVenda / receitaTotalMes;
  const baseRateada = roundMoney(proporcao * custosFixosBaseMes);
  return {
    base: baseRateada,
    aliquotaPercent: FIXED_COST_CREDIT_RATE * 100,
    credito: roundMoney(baseRateada * FIXED_COST_CREDIT_RATE),
    custosFixosMesTotal: roundMoney(custosFixosBaseMes),
    receitaMesTotal: roundMoney(receitaTotalMes),
  };
}

export function calcularCreditoOutrasDespesas(input: {
  saleFee: number;
  receitaBrutaVenda: number;
  receitaTotalItemMes: number;
  gastoAdsTotalItemMes: number;
  freightCost: number;
  receitaTotalMes: number;
  custosFixosBaseMes: number;
}): CreditoOutrasDespesasBreakdown {
  const meliFee = calcularCreditoMeliFee(input.saleFee);
  const ads = calcularCreditoAds(input);
  const frete = calcularCreditoFrete(input.freightCost);
  const custosFixos = calcularCreditoCustosFixosRateado(input);
  return {
    meliFee,
    ads,
    frete,
    custosFixos,
    creditoTotal: roundMoney(
      meliFee.credito + ads.credito + frete.credito + custosFixos.credito,
    ),
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
  if (result.frete.base > 0) {
    lines.push(
      `Frete pago na venda: R$ ${result.frete.base.toFixed(2)} × ${result.frete.aliquotaPercent.toFixed(2)}% = R$ ${result.frete.credito.toFixed(2)}`,
    );
  }
  if (result.custosFixos.receitaMesTotal > 0 && result.custosFixos.custosFixosMesTotal > 0) {
    lines.push(
      `Custos fixos no mês (aluguel etc.): R$ ${result.custosFixos.custosFixosMesTotal.toFixed(2)} / Receita do mês: R$ ${result.custosFixos.receitaMesTotal.toFixed(2)} → rateio desta venda: R$ ${result.custosFixos.base.toFixed(2)} × ${result.custosFixos.aliquotaPercent.toFixed(2)}% = R$ ${result.custosFixos.credito.toFixed(2)}`,
    );
  }
  lines.push(
    `(=) Crédito outras despesas (Meli + ADS + Frete + Custos fixos): R$ ${result.creditoTotal.toFixed(2)}`,
  );
  return lines;
}
