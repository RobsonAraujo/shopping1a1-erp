import { prisma } from "@/lib/db/db";
import {
  buildProductView,
  getCompanyPisCofinsPercent,
} from "@/lib/products/product-data";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import {
  custoProdutoFromView,
  type CustoProduto,
} from "@/lib/tax-report/enrichment/custo-produto";

export type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
export { custoProdutoFromView } from "@/lib/tax-report/enrichment/custo-produto";

export type CustoLookup = {
  /** Lookup por identidade (mlItemId) — preferir este; sku-texto não é mais único, `bySku` é só fallback pra linha sem produto resolvido. */
  byMlItemId: Map<string, CustoProduto>;
  bySku: Map<string, CustoProduto>;
};

/**
 * Carrega custos em batch (settings + products), por identidade (mlItemId)
 * e por sku-texto (fallback pra linha sem itemId resolvido — nunca usar
 * sku-texto como chave primária, `Product.sku` não é mais único).
 */
export async function loadCustoBySkuMap(
  organizationId: string,
  skus: string[],
  mlItemIds: string[] = [],
): Promise<CustoLookup> {
  const normalized = [
    ...new Set(skus.map((sku) => normalizeProductSku(sku)).filter(Boolean)),
  ];
  const uniqueMlItemIds = [...new Set(mlItemIds.filter(Boolean))];
  if (normalized.length === 0 && uniqueMlItemIds.length === 0) {
    return { byMlItemId: new Map(), bySku: new Map() };
  }

  const pisCofins = await getCompanyPisCofinsPercent(organizationId);
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      OR: [
        ...(normalized.length > 0 ? [{ sku: { in: normalized } }] : []),
        ...(uniqueMlItemIds.length > 0
          ? [{ mlItemId: { in: uniqueMlItemIds } }]
          : []),
      ],
    },
  });

  const byMlItemId = new Map<string, CustoProduto>();
  const bySku = new Map<string, CustoProduto>();
  for (const product of products) {
    const view = buildProductView(product, pisCofins);
    const custo = custoProdutoFromView(view);
    byMlItemId.set(product.mlItemId, custo);
    if (product.sku && !bySku.has(product.sku)) {
      bySku.set(product.sku, custo);
    }
  }
  return { byMlItemId, bySku };
}

// TODO: integrar com o serviço real de precificação se divergir do cadastro de produtos.
export async function obterCustoPorSku(
  organizationId: string,
  sku: string | null,
  mlItemId?: string | null,
): Promise<CustoProduto | null> {
  if (!sku && !mlItemId) return null;
  const { byMlItemId, bySku } = await loadCustoBySkuMap(
    organizationId,
    sku ? [sku] : [],
    mlItemId ? [mlItemId] : [],
  );
  return (
    (mlItemId ? byMlItemId.get(mlItemId) : undefined) ??
    (sku ? bySku.get(normalizeProductSku(sku)) : undefined) ??
    null
  );
}
