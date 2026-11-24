import { prisma } from "@/lib/db/db";
import { loadListingGroups, type ListingGroups } from "@/lib/products/listing-groups";
import { normalizeProductSku, type ResolvedProductPricing } from "@/lib/pricing/product-pricing";

export type KitComponent = { sku: string; quantity: number };

export type KitPricingResolution = {
  productCost: number;
  extraCosts: number;
  taxRatePercent: number | null;
  components: KitComponent[];
  missingSkus: string[];
};

/**
 * Cadastro manual mlItemId → SKUs componentes, usado quando o item é um kit
 * sem SKU próprio. Opção de venda de um kit (outro MLB do mesmo kit) usa a
 * composição cadastrada no anúncio principal.
 */
export async function loadKitsByMlItemId(
  organizationId: string,
  mlItemIds: string[],
  options?: { groups?: ListingGroups },
): Promise<Map<string, KitComponent[]>> {
  if (mlItemIds.length === 0) return new Map();
  const groups = options?.groups ?? (await loadListingGroups(organizationId));
  const principalById = new Map(mlItemIds.map((id) => [id, groups.principalOf(id)]));
  const kits = await prisma.kit.findMany({
    where: {
      organizationId,
      mlItemId: { in: [...new Set([...mlItemIds, ...principalById.values()])] },
    },
    include: { items: { include: { product: { select: { sku: true } } } } },
  });
  const componentsByKit = new Map(
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
  const result = new Map<string, KitComponent[]>();
  for (const id of mlItemIds) {
    const components = componentsByKit.get(principalById.get(id) ?? id) ?? componentsByKit.get(id);
    if (components) result.set(id, components);
  }
  return result;
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
