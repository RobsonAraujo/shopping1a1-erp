import { prisma } from "@/lib/db/db";
import type { Product } from "@/generated/prisma/client";

export type ProductResolution = {
  product: Product | null;
};

/** Uma linha de venda/anúncio a resolver — vem de `itemIdFromOrderLine`. */
export type OrderLineRef = {
  itemId: string | null | undefined;
};

export type ProductResolverMaps = {
  productByMlItemId: Map<string, Product>;
};

/**
 * Lógica pura de resolução de produto para uma linha de venda.
 *
 * Identidade = `mlItemId` (o "MLB..." do Mercado Livre) direto: `Product` é
 * cadastrado 1:1 por anúncio, sem tabela de vínculo nem matching por texto
 * de SKU. Sem `Product` cadastrado para o `mlItemId`, a linha fica sem
 * produto resolvido (sinalizada como alerta pelos consumidores, nunca
 * bloqueia geração de relatório).
 */
export function resolveProductForLine(
  line: OrderLineRef,
  maps: ProductResolverMaps,
): ProductResolution {
  if (!line.itemId) return { product: null };
  return { product: maps.productByMlItemId.get(line.itemId) ?? null };
}

/**
 * Carrega em lote tudo que `resolveProductForLine` precisa para um conjunto
 * de linhas de uma organização — uma chamada por relatório/mês, não uma por
 * linha (evita N+1 ao processar centenas de vendas).
 */
export async function loadProductResolverMaps(
  organizationId: string,
  lines: OrderLineRef[],
): Promise<ProductResolverMaps> {
  const itemIds = [
    ...new Set(lines.map((l) => l.itemId).filter((v): v is string => Boolean(v))),
  ];

  const products =
    itemIds.length > 0
      ? await prisma.product.findMany({
          where: { organizationId, mlItemId: { in: itemIds } },
        })
      : [];

  const productByMlItemId = new Map<string, Product>();
  for (const product of products) {
    if (product.mlItemId) productByMlItemId.set(product.mlItemId, product);
  }

  return { productByMlItemId };
}

/**
 * Nome do fornecedor cadastrado por `mlItemId`, para os consumidores que só
 * têm o SKU do anúncio (Compras, Estoque, Kanban) e precisam preferir o
 * fornecedor real cadastrado ao inferido por SKU (`getSkuSupplier`). Query
 * dedicada e leve — não usa `loadProductResolverMaps` (que traz o `Product`
 * inteiro) — uma chamada em lote, não por linha. Produtos sem fornecedor
 * cadastrado simplesmente não aparecem no Map; o chamador cai no fallback.
 */
export async function loadSupplierNamesByMlItemId(
  organizationId: string,
  mlItemIds: string[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(mlItemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  const products = await prisma.product.findMany({
    where: { organizationId, mlItemId: { in: uniqueIds }, supplierId: { not: null } },
    select: { mlItemId: true, supplier: { select: { name: true } } },
  });

  const result = new Map<string, string>();
  for (const product of products) {
    if (product.supplier) result.set(product.mlItemId, product.supplier.name);
  }
  return result;
}

/** Conveniência: carrega os mapas e devolve uma função de resolução por linha. */
export async function createProductResolver(
  organizationId: string,
  lines: OrderLineRef[],
): Promise<(line: OrderLineRef) => ProductResolution> {
  const maps = await loadProductResolverMaps(organizationId, lines);
  return (line: OrderLineRef) => resolveProductForLine(line, maps);
}

/**
 * Deriva o "SKU efetivo" (o texto cadastrado no Product, quando existe) por
 * `mlItemId`, para pipelines que ainda indexam dados por texto de SKU
 * (nivelamento de custo do DRE, tax-report) mas processam uma lista de
 * anúncios ML de uma vez. Sem Product cadastrado, cai no SKU bruto do
 * anúncio — é só rótulo de exibição/agrupamento, não mais identidade.
 */
export async function resolveEffectiveSkuByItemId(
  organizationId: string,
  items: { id: string; sku: string | null }[],
): Promise<Map<string, string | null>> {
  const lines: OrderLineRef[] = items.map((item) => ({ itemId: item.id }));
  const maps = await loadProductResolverMaps(organizationId, lines);

  const result = new Map<string, string | null>();
  for (const item of items) {
    const resolution = resolveProductForLine({ itemId: item.id }, maps);
    result.set(item.id, resolution.product?.sku ?? item.sku);
  }
  return result;
}
