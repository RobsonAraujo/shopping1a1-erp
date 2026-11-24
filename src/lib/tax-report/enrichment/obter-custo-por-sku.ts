import { prisma } from "@/lib/db/db";
import {
  buildProductView,
  getCompanyPisCofinsPercent,
} from "@/lib/products/product-data";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import { loadListingGroups, type ListingGroups } from "@/lib/products/listing-groups";
import {
  custoProdutoFromView,
  type CustoProduto,
} from "@/lib/tax-report/enrichment/custo-produto";

export type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
export { custoProdutoFromView } from "@/lib/tax-report/enrichment/custo-produto";

export type CustoLookup = {
  /** Lookup por identidade (mlItemId) — preferir este; sku-texto não é mais único, `bySku` é só fallback pra linha sem produto resolvido. Opção de venda já responde com o cadastro do principal. */
  byMlItemId: Map<string, CustoProduto>;
  bySku: Map<string, CustoProduto>;
  /** Anúncio principal do produto (opções de venda) — o nivelamento do principal vale para a opção. Ausente = o próprio MLB. */
  principalOf?: (mlItemId: string) => string;
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
  options?: { groups?: ListingGroups },
): Promise<CustoLookup> {
  const normalized = [
    ...new Set(skus.map((sku) => normalizeProductSku(sku)).filter(Boolean)),
  ];
  const uniqueMlItemIds = [...new Set(mlItemIds.filter(Boolean))];
  if (normalized.length === 0 && uniqueMlItemIds.length === 0) {
    return { byMlItemId: new Map(), bySku: new Map() };
  }

  const [pisCofins, groups] = await Promise.all([
    getCompanyPisCofinsPercent(organizationId),
    options?.groups ?? loadListingGroups(organizationId),
  ]);
  const principalIds = uniqueMlItemIds.map((id) => groups.principalOf(id));
  const lookupIds = [...new Set([...uniqueMlItemIds, ...principalIds])];
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      OR: [
        ...(normalized.length > 0 ? [{ sku: { in: normalized } }] : []),
        ...(lookupIds.length > 0 ? [{ mlItemId: { in: lookupIds } }] : []),
      ],
    },
  });
  // O cadastro do principal chega antes do cadastro duplicado de uma opção
  // ("primeiro que chega" no índice por SKU).
  products.sort(
    (a, b) => Number(groups.isOption(a.mlItemId)) - Number(groups.isOption(b.mlItemId)),
  );

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
  // Opção de venda responde com o cadastro do principal — inclusive quando a
  // própria opção tem um cadastro pendente (custo 0) vindo do "Importar todos",
  // que antes fazia a venda dela contar como "sem custo" aqui.
  for (const id of uniqueMlItemIds) {
    const principal = groups.principalOf(id);
    const custo = principal !== id ? byMlItemId.get(principal) : undefined;
    if (custo) byMlItemId.set(id, custo);
  }
  return { byMlItemId, bySku, principalOf: groups.principalOf };
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
