import { prisma } from "@/lib/db";
import {
  buildProductView,
  getCompanyPisCofinsPercent,
} from "@/lib/product-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import {
  indexBySkuWithAliases,
  resolveCanonicalSku,
  type SkuAliasMap,
} from "@/lib/product-sku-alias";
import { loadSkuAliasMap } from "@/lib/product-sku-alias-data";
import {
  custoProdutoFromView,
  type CustoProduto,
} from "@/lib/tax-report/enrichment/custo-produto";

export type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
export { custoProdutoFromView } from "@/lib/tax-report/enrichment/custo-produto";

/** Carrega custos de todos os SKUs em batch (settings + products + aliases). */
export async function loadCustoBySkuMap(
  skus: string[],
  aliasMap?: SkuAliasMap,
): Promise<Map<string, CustoProduto>> {
  const normalized = [
    ...new Set(skus.map((sku) => normalizeProductSku(sku)).filter(Boolean)),
  ];
  if (normalized.length === 0) return new Map();

  const map = aliasMap ?? (await loadSkuAliasMap());
  const canonicalSkus = [
    ...new Set(normalized.map((sku) => resolveCanonicalSku(sku, map))),
  ].filter(Boolean);

  const pisCofins = await getCompanyPisCofinsPercent();
  const products = await prisma.product.findMany({
    where: { sku: { in: canonicalSkus } },
  });

  const byCanonical = new Map<string, CustoProduto>();
  for (const product of products) {
    const view = buildProductView(product, pisCofins);
    byCanonical.set(product.sku, custoProdutoFromView(view));
  }

  const indexed = indexBySkuWithAliases(byCanonical, normalized, map);
  for (const canonical of canonicalSkus) {
    const value = byCanonical.get(canonical);
    if (value !== undefined) {
      indexed.set(canonical, value);
    }
  }
  return indexed;
}

// TODO: integrar com o serviço real de precificação se divergir do cadastro de produtos.
export async function obterCustoPorSku(
  sku: string | null,
): Promise<CustoProduto | null> {
  if (!sku) return null;
  const map = await loadCustoBySkuMap([sku]);
  return map.get(normalizeProductSku(sku)) ?? null;
}
