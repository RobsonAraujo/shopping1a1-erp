import { roundMoney } from "@/lib/financial-margin";
import type {
  ItemPriceRecord,
  QuantityPriceWriteNode,
} from "@/lib/mercadolibre/item-quantity-prices";
import {
  isBusinessQuantityPrice,
  isRetailStandardPrice,
} from "@/lib/mercadolibre/item-quantity-prices";

export type WholesaleNetPriceTier = {
  level: 1 | 2 | 3;
  minPurchaseUnit: number;
  netAmount: number;
};

export type BuildNetWholesalePricesPayloadInput = {
  /** Preço líquido da âncora B2B (nível 1 sugerido ou preço vigente no anúncio). */
  anchorNetAmount: number;
  currencyId: string;
  tiers: WholesaleNetPriceTier[];
  currentPrices: ItemPriceRecord[];
  /** Quando true, não preserva faixas B2B antigas fora do envio (aplica tabela completa). */
  replaceAllBusinessTiers?: boolean;
};

export type BuildNetWholesalePricesPayloadResult = {
  prices: QuantityPriceWriteNode[];
};

const BUSINESS_CONTEXT = ["channel_marketplace", "user_type_business"] as const;

export function validateWholesaleNetTiers(
  tiers: WholesaleNetPriceTier[],
): string | null {
  if (tiers.length === 0) {
    return null;
  }

  const sorted = [...tiers].sort(
    (a, b) => a.minPurchaseUnit - b.minPurchaseUnit,
  );

  for (let i = 0; i < sorted.length; i++) {
    const tier = sorted[i];
    if (!Number.isInteger(tier.minPurchaseUnit) || tier.minPurchaseUnit < 2) {
      return `Nível ${tier.level}: quantidade mínima deve ser inteira ≥ 2.`;
    }
    if (!Number.isFinite(tier.netAmount) || tier.netAmount <= 0) {
      return `Nível ${tier.level}: preço líquido inválido.`;
    }
    if (i > 0 && sorted[i - 1].minPurchaseUnit >= tier.minPurchaseUnit) {
      return "Quantidades mínimas devem crescer entre as faixas aplicadas.";
    }
    if (i > 0 && sorted[i - 1].netAmount < tier.netAmount) {
      return "Preços líquidos devem cair conforme a quantidade mínima aumenta.";
    }
  }

  return null;
}

export function buildNetWholesalePricesPayload(
  input: BuildNetWholesalePricesPayloadInput,
): BuildNetWholesalePricesPayloadResult {
  const anchorNetAmount = roundMoney(input.anchorNetAmount);
  if (!Number.isFinite(anchorNetAmount) || anchorNetAmount <= 0) {
    throw new Error("Preço da âncora B2B inválido.");
  }
  if (!input.currencyId) {
    throw new Error("Moeda do anúncio indisponível.");
  }

  const tierError = validateWholesaleNetTiers(input.tiers);
  if (tierError) {
    throw new Error(tierError);
  }

  const sortedTiers = [...input.tiers].sort(
    (a, b) => a.minPurchaseUnit - b.minPurchaseUnit,
  );

  if (
    sortedTiers.length > 0 &&
    anchorNetAmount < roundMoney(sortedTiers[0].netAmount)
  ) {
    throw new Error(
      "Preço da âncora deve ser maior ou igual ao primeiro desconto.",
    );
  }

  const retailKeepers: QuantityPriceWriteNode[] = input.currentPrices
    .filter(isRetailStandardPrice)
    .map((price) => ({ id: price.id }));

  const appliedMinUnits = new Set(sortedTiers.map((t) => t.minPurchaseUnit));

  const preservedBusinessTiers: QuantityPriceWriteNode[] =
    input.replaceAllBusinessTiers
      ? []
      : input.currentPrices
          .filter(isBusinessQuantityPrice)
          .filter((price) => {
            const min = price.conditions?.min_purchase_unit;
            return (
              min !== 1 && min !== undefined && !appliedMinUnits.has(min)
            );
          })
          .map((price) => ({
            type: "standard" as const,
            amount: roundMoney(price.amount ?? 0),
            currency_id: price.currency_id ?? input.currencyId,
            amount_tax_inclusion_type: "net" as const,
            conditions: {
              context_restrictions: [...BUSINESS_CONTEXT],
              min_purchase_unit: price.conditions!.min_purchase_unit,
            },
          }))
          .filter((node) => node.amount > 0);

  // Âncora ML (min=1) — preço sugerido do nível 1 ou preço B2B vigente.
  const anchor: QuantityPriceWriteNode = {
    type: "standard",
    amount: anchorNetAmount,
    currency_id: input.currencyId,
    amount_tax_inclusion_type: "net",
    conditions: {
      context_restrictions: [...BUSINESS_CONTEXT],
      min_purchase_unit: 1,
    },
  };

  const tierNodes: QuantityPriceWriteNode[] = sortedTiers.map((tier) => ({
    type: "standard",
    amount: roundMoney(tier.netAmount),
    currency_id: input.currencyId,
    amount_tax_inclusion_type: "net",
    conditions: {
      context_restrictions: [...BUSINESS_CONTEXT],
      min_purchase_unit: tier.minPurchaseUnit,
    },
  }));

  const allBusinessTiers = [...preservedBusinessTiers, ...tierNodes].sort(
    (a, b) =>
      (a.conditions?.min_purchase_unit ?? 0) -
      (b.conditions?.min_purchase_unit ?? 0),
  );

  for (let i = 1; i < allBusinessTiers.length; i++) {
    const prev = allBusinessTiers[i - 1].amount ?? 0;
    const next = allBusinessTiers[i].amount ?? 0;
    if (prev < next) {
      throw new Error(
        "Após mesclar faixas existentes, os preços líquidos devem cair conforme a quantidade aumenta.",
      );
    }
  }

  return {
    prices: [...retailKeepers, anchor, ...allBusinessTiers],
  };
}
