import type { FinancialTaxSource } from "@/lib/lucratividade/financial-evaluation-data";
import type { MlCostsAtPrice } from "@/lib/pricing/refine-min-sale-price";
import { inputsWithAds, type TacosAds } from "@/lib/pricing/tacos-basis";
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
 * taxa e o frete já cotados (`rescoreWithInputs`, em `@/lib/pricing/tacos-basis`,
 * aplicado pelo simulador). Puro, sem "use client".
 */

export type { TacosBasis } from "@/lib/pricing/tacos-basis";
export { adsSpendWithoutSales, inputsForType, inputsWithAds } from "@/lib/pricing/tacos-basis";

/** O ADS de um anúncio numa janela do Product Ads (a base compartilhada com a Central). */
export type CalculatorAds = TacosAds;

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
