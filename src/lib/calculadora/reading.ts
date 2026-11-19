import type { FinancialTaxSource } from "@/lib/lucratividade/financial-evaluation-data";
import { listingTypeLabelFromId } from "@/lib/pricing/financial-margin";
import type { MlCostsAtPrice } from "@/lib/pricing/refine-min-sale-price";
import type { SimulationBlock } from "@/lib/rotina/simulate";
import { simulateMarginAtPrice, type SimulatedPrice } from "@/lib/rotina/simulate-margin";
import type { CatalogLiveStatus, RotinaPricingInputs } from "@/lib/rotina/types";

/**
 * A leitura da Calculadora: um anúncio lido **agora** no Mercado Livre, sem
 * depender do retrato da Central. É a mesma linha da Lucratividade em
 * "Simulação · preço de hoje" (preço com promoção, taxa e frete cotados,
 * custo do cadastro, imposto de 30 dias), só que de um anúncio.
 *
 * O TACOS tem duas bases: **hoje** (o padrão, lido junto) e **7 dias** (sob
 * demanda). Trocar de base não cota nada: a conta refaz no navegador com a
 * taxa e o frete já cotados (`rescoreSimulated`). Puro, sem "use client".
 */

/** De onde sai o TACOS da conta: o de hoje (até agora) ou o de 7 dias. */
export type TacosBasis = "today" | "7d";

/** O ADS de um anúncio numa janela do Product Ads. */
export type CalculatorAds = {
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

export type CalculatorCatalog = {
  status: CatalogLiveStatus;
  priceToWin: number | null;
};

export type CalculatorReading = {
  mlItemId: string;
  /** Quando foi lido (ISO). */
  readAt: string;
  listingTypeId: string | null;
  /** Preço de venda de agora (com promoção). */
  price: number;
  /** Preço sem a promoção; `null` sem promoção. */
  regularPrice: number | null;
  hasPromotion: boolean;
  /** `false` = o ML não disse se há promoção (o preço é o do anúncio). */
  promotionKnown: boolean;
  pmaPrice: number | null;
  /** Taxa e frete cotados no preço de agora; `null` se o ML não cotou. */
  costsNow: MlCostsAtPrice | null;
  /** Custo, imposto e rebate (o ADS entra pela base escolhida). */
  inputs: RotinaPricingInputs;
  taxSource: FinancialTaxSource | null;
  /** Sem custo/alíquota/kit completo a conta não vale. */
  blocked: SimulationBlock;
  /** Só anúncio de catálogo; `null` se o ML não respondeu. */
  catalog: CalculatorCatalog | null;
  /** A meta que vale (do anúncio ou do segmento). */
  targetPercent: number;
  ownTarget: boolean;
  /** ADS de hoje, lido junto. */
  ads: CalculatorAds;
};

/** Os insumos com o ADS de uma base. */
export function inputsWithAds(
  inputs: RotinaPricingInputs,
  ads: CalculatorAds,
): RotinaPricingInputs {
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
export function adsSpendWithoutSales(ads: CalculatorAds): boolean {
  return ads.available && ads.tacosPercent === null && (ads.adsCost ?? 0) > 0;
}

/** A margem no preço de agora, com o ADS da base escolhida (sem cotar de novo). */
export function marginNow(
  reading: CalculatorReading,
  ads: CalculatorAds,
  targetPercent: number,
): SimulatedPrice {
  return simulateMarginAtPrice(
    reading.price,
    reading.costsNow,
    inputsWithAds(reading.inputs, ads),
    targetPercent,
  );
}

/**
 * Um preço já simulado refeito com o ADS de outra base: a taxa e o frete
 * cotados não mudam, só o TACOS (e o veredito). Não chama o ML.
 */
export function rescoreSimulated(
  result: SimulatedPrice,
  reading: CalculatorReading,
  ads: CalculatorAds,
  targetPercent: number,
): SimulatedPrice {
  if (!result.quoted || result.mlFeeAmount === null || result.shippingCost === null) {
    return result;
  }
  const inputs = inputsForType(
    inputsWithAds(reading.inputs, ads),
    reading.listingTypeId,
    result.listingTypeId,
  );
  return simulateMarginAtPrice(
    result.price,
    { mlFeeAmount: result.mlFeeAmount, shippingCost: result.shippingCost },
    inputs,
    targetPercent,
  );
}
