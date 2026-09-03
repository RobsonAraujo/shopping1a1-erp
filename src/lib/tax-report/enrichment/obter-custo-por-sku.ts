import { prisma } from "@/lib/db";
import {
  buildProductView,
  getCompanyPisCofinsPercent,
} from "@/lib/product-data";
import { normalizeProductSku } from "@/lib/product-pricing";
import {
  custoProdutoFromView,
  type CustoProduto,
} from "@/lib/tax-report/enrichment/custo-produto";

export type { CustoProduto } from "@/lib/tax-report/enrichment/custo-produto";
export { custoProdutoFromView } from "@/lib/tax-report/enrichment/custo-produto";

/** Carrega custos de todos os SKUs em batch (settings + products). */
export async function loadCustoBySkuMap(
  organizationId: string,
  skus: string[],
): Promise<Map<string, CustoProduto>> {
  const normalized = [
    ...new Set(skus.map((sku) => normalizeProductSku(sku)).filter(Boolean)),
  ];
  if (normalized.length === 0) return new Map();

  const pisCofins = await getCompanyPisCofinsPercent(organizationId);
  const products = await prisma.product.findMany({
    where: { organizationId, sku: { in: normalized } },
  });

  const bySku = new Map<string, CustoProduto>();
  for (const product of products) {
    if (!product.sku || bySku.has(product.sku)) continue;
    const view = buildProductView(product, pisCofins);
    bySku.set(product.sku, custoProdutoFromView(view));
  }
  return bySku;
}

// TODO: integrar com o serviço real de precificação se divergir do cadastro de produtos.
export async function obterCustoPorSku(
  organizationId: string,
  sku: string | null,
): Promise<CustoProduto | null> {
  if (!sku) return null;
  const map = await loadCustoBySkuMap(organizationId, [sku]);
  return map.get(normalizeProductSku(sku)) ?? null;
}
