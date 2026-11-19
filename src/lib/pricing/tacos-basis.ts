import type { AdsLoad } from "@/lib/lucratividade/financial-evaluation-data";
import { listingTypeLabelFromId } from "@/lib/pricing/financial-margin";
import { simulateMarginAtPrice, type SimulatedPrice } from "@/lib/rotina/simulate-margin";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

/**
 * A base do TACOS numa simulação de preço: o de **hoje** (até agora) ou o dos
 * **últimos 7 dias** (o da Lucratividade e das tarefas da Central). Usado pela
 * Calculadora e pelo "Simular" da Central.
 *
 * Trocar de base não cota nada: um preço já simulado traz a taxa e o frete
 * cotados, e `rescoreWithInputs` refaz a conta com o outro TACOS. Puro.
 */

export type TacosBasis = "today" | "7d";

/** O ADS de um anúncio numa janela do Product Ads. */
export type TacosAds = {
  basis: TacosBasis;
  /** Janela lida (`YYYY-MM-DD`, dia civil de SP). */
  from: string;
  to: string;
  /** `false` = o Product Ads não respondeu: a conta decide pela MC. */
  available: boolean;
  /** `null` com gasto = gasto sem venda na janela. */
  tacosPercent: number | null;
  adsCost: number | null;
  adsUnitsSold: number | null;
  /** Status no Product Ads (`active`, `paused`, `idle`…); `null` = fora do ADS. */
  status: string | null;
};

/** Dias de cada base na consulta do Product Ads. */
export const TACOS_BASIS_DAYS: Record<TacosBasis, number> = { today: 1, "7d": 7 };

/** O ADS de um anúncio numa janela, a partir da leitura em lote do Product Ads. */
export function adsFromLoad(
  load: AdsLoad,
  mlItemId: string,
  basis: TacosBasis,
  range: { dateFrom: string; dateTo: string },
): TacosAds {
  const window = { basis, from: range.dateFrom, to: range.dateTo };
  if (!load.available) {
    return {
      ...window,
      available: false,
      tacosPercent: null,
      adsCost: null,
      adsUnitsSold: null,
      status: null,
    };
  }
  const metrics = load.map.get(mlItemId);
  // Sem linha no Product Ads na janela = sem gasto: TACOS 0%, como na Lucratividade.
  if (!metrics) {
    return { ...window, available: true, tacosPercent: 0, adsCost: 0, adsUnitsSold: 0, status: null };
  }
  return {
    ...window,
    available: true,
    tacosPercent: metrics.tacosPercent,
    adsCost: metrics.cost,
    adsUnitsSold: metrics.unitsQuantity,
    status: metrics.status,
  };
}

/** Os insumos com o ADS de uma base. */
export function inputsWithAds(inputs: RotinaPricingInputs, ads: TacosAds): RotinaPricingInputs {
  return {
    ...inputs,
    adsMetricsAvailable: ads.available,
    tacosPercent: ads.tacosPercent,
    adsCost: ads.adsCost,
    adsUnitsSold: ads.adsUnitsSold,
  };
}

/** Os insumos no tipo simulado: só o rótulo da taxa muda ("Taxa Premium"). */
export function inputsForType(
  inputs: RotinaPricingInputs,
  currentListingTypeId: string | null,
  listingTypeId: string | null,
): RotinaPricingInputs {
  if (!listingTypeId || listingTypeId === currentListingTypeId) {
    return { ...inputs, listingTypeId: currentListingTypeId ?? inputs.listingTypeId };
  }
  return { ...inputs, listingTypeId, listingTypeLabel: listingTypeLabelFromId(listingTypeId) };
}

/** Gasto em ADS e nenhuma venda na janela: o TACOS não sai. */
export function adsSpendWithoutSales(ads: TacosAds): boolean {
  return ads.available && ads.tacosPercent === null && (ads.adsCost ?? 0) > 0;
}

/**
 * Um preço já simulado refeito com outros insumos: o ADS de outra base e/ou
 * outro custo (o orçamento da Calculadora). A taxa e o frete cotados não
 * mudam, só a margem e o veredito. Não chama o ML. `baseInputs` são os
 * insumos no tipo de hoje; `ads: null` = o ADS que já está neles.
 */
export function rescoreWithInputs(
  result: SimulatedPrice,
  baseInputs: RotinaPricingInputs,
  currentListingTypeId: string | null,
  ads: TacosAds | null,
  targetPercent: number,
): SimulatedPrice {
  if (!result.quoted || result.mlFeeAmount === null || result.shippingCost === null) {
    return result;
  }
  const inputs = inputsForType(
    ads ? inputsWithAds(baseInputs, ads) : baseInputs,
    currentListingTypeId,
    result.listingTypeId,
  );
  return simulateMarginAtPrice(
    result.price,
    { mlFeeAmount: result.mlFeeAmount, shippingCost: result.shippingCost },
    inputs,
    targetPercent,
  );
}
