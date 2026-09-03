import { prisma } from "@/lib/db";
import { normalizeProductSku, type ResolvedProductPricing } from "@/lib/product-pricing";

export type KitComponent = { sku: string; quantity: number };

export type KitPricingResolution = {
  productCost: number;
  extraCosts: number;
  taxRatePercent: number | null;
  components: KitComponent[];
  missingSkus: string[];
};

/** Cadastro manual mlItemId → SKUs componentes, usado quando o item é um kit sem SKU próprio. */
export async function loadKitsByMlItemId(
  organizationId: string,
  mlItemIds: string[],
): Promise<Map<string, KitComponent[]>> {
  if (mlItemIds.length === 0) return new Map();
  const kits = await prisma.kit.findMany({
    where: { organizationId, mlItemId: { in: mlItemIds } },
    include: { items: { include: { product: { select: { sku: true } } } } },
  });
  return new Map(
    kits.map((kit) => [
      kit.mlItemId,
      kit.items.map((item) => ({
        // Componente do kit é identificado por mlItemId (FK real); o sku
        // aqui é só o espelho de exibição do Product vinculado, usado como
        // chave de busca de custo/imposto (loadProductsMapBySku). Sem sku
        // cadastrado, cai no próprio mlItemId — não bate com nada em
        // pricingBySku/taxBySku, aparece como componente sem custo (mesmo
        // tratamento de "missingSkus" de antes).
        sku: item.product.sku ?? item.productMlItemId,
        quantity: Number(item.quantity),
      })),
    ]),
  );
}

/** Soma custo/extras/alíquota dos componentes do kit já cadastrados em Meus produtos. */
export function resolveKitPricing(
  components: KitComponent[],
  pricingBySku: Map<string, ResolvedProductPricing>,
  taxBySku: Map<string, number>,
): KitPricingResolution {
  let productCost = 0;
  let extraCosts = 0;
  let taxTotal = 0;
  let taxKnownCost = 0;
  const missingSkus: string[] = [];

  for (const component of components) {
    const canonical = normalizeProductSku(component.sku);
    const pricing = pricingBySku.get(canonical);
    if (!pricing) {
      missingSkus.push(component.sku);
      continue;
    }
    const cost = pricing.pricingCost * component.quantity;
    productCost += cost;
    extraCosts += pricing.extraCosts * component.quantity;

    const taxPercent = taxBySku.get(canonical);
    if (taxPercent !== undefined) {
      taxTotal += cost * (taxPercent / 100);
      taxKnownCost += cost;
    }
  }

  const taxRatePercent = taxKnownCost > 0 ? (taxTotal / taxKnownCost) * 100 : null;

  return { productCost, extraCosts, taxRatePercent, components, missingSkus };
}
