import { computeEffectivePricingCost } from "@/lib/pricing/product-pricing";
import type { MlCostsAtPrice } from "@/lib/pricing/refine-min-sale-price";
import { simulateMarginAtPrice } from "@/lib/rotina/simulate-margin";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

/**
 * "Quanto posso pagar na compra?" e "com este orçamento, quanto fica a
 * margem?" — a conta de margem ao contrário, no custo.
 *
 * Num preço já cotado, a taxa e o frete do ML não dependem do custo do
 * produto; imposto (% da venda) e ADS (TACOS × preço) também não. Então a
 * margem é linear no custo e as duas perguntas saem no navegador, sem cotar
 * nada de novo. O veredito é o do simulador (`simulateMarginAtPrice`): pagar o
 * custo máximo fecha a meta, um centavo a mais não.
 *
 * O custo da conta é o do cadastro: `(custo c/ ST ou custo NF) × (1 + IPI)`
 * (`computeEffectivePricingCost`). O fornecedor cota o preço unitário na NF,
 * então os dois sentidos convertem pelo IPI e pela ST do cadastro. A ST de
 * outro preço é estimada na mesma proporção (custo c/ ST ÷ custo NF). Puro.
 */

/** Dá para falar em preço de NF: um produto (ou um kit de um produto só × N). */
export type CalculatorNfBasis = {
  kind: "nf";
  /** Custo unitário na NF do cadastro (sem IPI e sem ST). */
  unitCostNf: number;
  ipiPercent: number;
  /** Custo c/ ST ÷ custo NF do cadastro; `null` = sem ST. */
  stFactor: number | null;
  /** Unidades do produto no anúncio: 1, ou N num kit de um SKU só. */
  units: number;
};

/**
 * De onde a Calculadora converte orçamento ↔ custo da conta. `effective` = só
 * no custo da conta: kit de vários produtos (`kit`) ou cadastro que não fecha
 * com o custo da leitura (`unknown`).
 */
export type CalculatorPurchaseBasis =
  | CalculatorNfBasis
  | { kind: "effective"; reason: "kit" | "unknown" };

/** Para baixo, no centavo (com folga para o erro do ponto flutuante). */
function floorCents(value: number): number {
  return Math.floor(value * 100 + 1e-7) / 100;
}

/** NF → custo da conta, por unidade: ST (proporção do cadastro) × (1 + IPI). */
export function nfFactor(basis: CalculatorNfBasis): number {
  return (basis.stFactor ?? 1) * (1 + basis.ipiPercent / 100);
}

/** O custo do anúncio na conta para um preço unitário na NF (o orçamento). */
export function effectiveCostFromNf(nfUnitPrice: number, basis: CalculatorNfBasis): number {
  return Math.round(nfUnitPrice * nfFactor(basis) * basis.units * 100) / 100;
}

/**
 * O maior preço unitário na NF que cabe num custo da conta (para baixo, no
 * centavo): pagar isso nunca passa do custo pedido.
 */
export function nfUnitPriceForCost(cost: number, basis: CalculatorNfBasis): number {
  return floorCents(cost / basis.units / nfFactor(basis));
}

/** Converte só quando há o que converter: sem IPI, sem ST e 1 unidade, NF = custo da conta. */
export function nfDiffersFromEffective(basis: CalculatorPurchaseBasis): basis is CalculatorNfBasis {
  return basis.kind === "nf" && (basis.units !== 1 || Math.abs(nfFactor(basis) - 1) > 1e-9);
}

/**
 * O maior custo do produto (na conta, em R$) que ainda fecha a meta neste
 * preço, com a taxa e o frete já cotados. A margem só cai com o custo, então
 * a busca é por bisseção no centavo, com o próprio veredito do simulador.
 * `null` = nem com custo zero a meta fecha (ou o preço não foi cotado).
 */
export function maxProductCostAtPrice(
  price: number,
  costs: MlCostsAtPrice | null,
  inputs: RotinaPricingInputs,
  targetPercent: number,
): number | null {
  if (!costs || !(price > 0)) return null;
  const meets = (cents: number) =>
    simulateMarginAtPrice(price, costs, { ...inputs, productCost: cents / 100 }, targetPercent)
      .meetsTarget === true;
  if (!meets(0)) return null;
  // Meta negativa deixa o custo passar do preço; acima disso nenhuma meta fecha.
  let hi = Math.ceil(price * 100 * (1 + Math.max(0, -targetPercent) / 100)) + 100;
  if (meets(hi)) return hi / 100;
  let lo = 0;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (meets(mid)) lo = mid;
    else hi = mid;
  }
  return lo / 100;
}

/** O produto do cadastro como `ProductRecordForPricing` precisa (só o que entra no custo). */
export type PurchaseProductRecord = {
  unitCostNf: number;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
  purchaseCostWithSt: number | null;
  ipiPercent: number;
};

/**
 * A base de conversão de um produto do cadastro, só se ela refaz o custo que a
 * leitura usou (`expectedCost`, já × unidades): assim o "pague até" na NF
 * nunca contradiz a margem da tela.
 */
export function nfBasisFromProduct(
  product: PurchaseProductRecord,
  units: number,
  expectedCost: number,
): CalculatorNfBasis | null {
  if (!(units > 0) || !(product.unitCostNf > 0)) return null;
  const cost = computeEffectivePricingCost({
    ...product,
    isMonophasic: false,
    pisCofinsPercent: 0,
  });
  if (cost === null || Math.abs(cost * units - expectedCost) > 0.011 * units) return null;
  let stFactor: number | null = null;
  if (product.hasIcmsSt) {
    if (product.purchaseCostWithSt === null || !(product.purchaseCostWithSt > 0)) return null;
    stFactor = product.purchaseCostWithSt / product.unitCostNf;
  }
  return {
    kind: "nf",
    unitCostNf: product.unitCostNf,
    ipiPercent: product.ipiPercent,
    stFactor,
    units,
  };
}
