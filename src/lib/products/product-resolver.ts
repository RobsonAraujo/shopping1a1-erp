import { prisma } from "@/lib/db/db";
import type { Product } from "@/generated/prisma/client";
import { getSkuSupplier } from "@/lib/mercadolibre/item-sku";
import { loadListingGroups, type ListingGroups } from "@/lib/products/listing-groups";

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
 * Identidade = `mlItemId` (o "MLB..." do Mercado Livre) direto, sem tabela
 * de vínculo nem matching por texto de SKU. Opção de venda (outro MLB do
 * mesmo produto físico) resolve para o cadastro do anúncio principal — o
 * mapa já vem montado assim por `loadProductResolverMaps`. Sem cadastro, a
 * linha fica sem produto resolvido (sinalizada como alerta pelos
 * consumidores, nunca bloqueia geração de relatório).
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
 *
 * `excludeInactive`: por padrão inclui produto inativo (histórico de
 * DRE/Relatório Tributário não pode "perder" um produto que foi desativado
 * depois de vender). Só telas operacionais que precisam mesmo excluir
 * produto inativo (ex.: Relatório de Estoque) passam `true`.
 */
export async function loadProductResolverMaps(
  organizationId: string,
  lines: OrderLineRef[],
  options?: { excludeInactive?: boolean; groups?: ListingGroups },
): Promise<ProductResolverMaps> {
  const itemIds = [
    ...new Set(lines.map((l) => l.itemId).filter((v): v is string => Boolean(v))),
  ];
  const productByMlItemId = new Map<string, Product>();
  if (itemIds.length === 0) return { productByMlItemId };

  // Opção de venda usa o cadastro do principal; o cadastro da própria opção
  // (duplicado antigo) só vale se o principal não tiver.
  const groups = options?.groups ?? (await loadListingGroups(organizationId));
  const principalByItemId = new Map(itemIds.map((id) => [id, groups.principalOf(id)]));
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      mlItemId: { in: [...new Set([...itemIds, ...principalByItemId.values()])] },
      ...(options?.excludeInactive ? { active: true } : {}),
    },
  });
  const byId = new Map(products.map((product) => [product.mlItemId, product]));
  for (const itemId of itemIds) {
    const product = byId.get(principalByItemId.get(itemId) ?? itemId) ?? byId.get(itemId);
    if (product) productByMlItemId.set(itemId, product);
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
  options?: { groups?: ListingGroups },
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(mlItemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Map();

  // O fornecedor é do produto: a opção de venda usa o do cadastro principal.
  const groups = options?.groups ?? (await loadListingGroups(organizationId));
  const principalById = new Map(uniqueIds.map((id) => [id, groups.principalOf(id)]));
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      mlItemId: { in: [...new Set([...uniqueIds, ...principalById.values()])] },
      supplierId: { not: null },
    },
    select: { mlItemId: true, supplier: { select: { name: true } } },
  });
  const nameById = new Map(
    products
      .filter((product) => product.supplier)
      .map((product) => [product.mlItemId, product.supplier!.name]),
  );

  const result = new Map<string, string>();
  for (const id of uniqueIds) {
    const name = nameById.get(principalById.get(id) ?? id) ?? nameById.get(id);
    if (name) result.set(id, name);
  }
  return result;
}

/**
 * Subconjunto de `mlItemIds` que tem `Product.active = false` — usado para
 * remover produto inativado das telas operacionais (Kanban de Compras,
 * Operações Full, Inventory) ANTES de montar cards/linhas, sem tocar
 * `ReplenishmentCycle`/histórico. Query dedicada e leve (só `mlItemId`),
 * mesmo estilo de `loadSupplierNamesByMlItemId`.
 */
export async function loadInactiveProductMlItemIds(
  organizationId: string,
  mlItemIds: string[],
  options?: { groups?: ListingGroups },
): Promise<Set<string>> {
  const uniqueIds = [...new Set(mlItemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return new Set();

  // Opção de venda segue o cadastro principal: produto inativado some com
  // todas as opções; um cadastro duplicado inativo de uma opção não esconde
  // o produto.
  const groups = options?.groups ?? (await loadListingGroups(organizationId));
  const principalById = new Map(uniqueIds.map((id) => [id, groups.principalOf(id)]));
  const rows = await prisma.product.findMany({
    where: {
      organizationId,
      mlItemId: { in: [...new Set([...uniqueIds, ...principalById.values()])] },
    },
    select: { mlItemId: true, active: true },
  });
  const activeById = new Map(rows.map((r) => [r.mlItemId, r.active]));
  const result = new Set<string>();
  for (const id of uniqueIds) {
    const principal = principalById.get(id) ?? id;
    const active = activeById.get(principal) ?? activeById.get(id);
    if (active === false) result.add(id);
  }
  return result;
}

/**
 * Filtra `mlItemIds` para só os que pertencem a `supplier` — mesma regra de
 * resolução usada linha a linha em `loadDashboardPurchaseData` (fornecedor
 * cadastrado, com fallback pro prefixo do SKU), mas ANTES do sweep pesado de
 * ML (multiget, vendas por item, categorias). Usa `Listing.skuSnapshot`
 * (cache local, sem chamada ao ML) pro fallback — é só pra decidir quais
 * `mlItemId`s entram no pipeline caro; o valor calculado em cima deles
 * continua vindo do item ao vivo. Usado pela página de detalhe de um
 * fornecedor em Compras, que antes computava o catálogo inteiro e descartava
 * quase tudo.
 */
export async function resolveMlItemIdsForSupplier(
  organizationId: string,
  mlItemIds: string[],
  supplier: string,
): Promise<string[]> {
  const uniqueIds = [...new Set(mlItemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];

  const [supplierNames, listings] = await Promise.all([
    loadSupplierNamesByMlItemId(organizationId, uniqueIds),
    prisma.listing.findMany({
      where: { organizationId, mlItemId: { in: uniqueIds } },
      select: { mlItemId: true, skuSnapshot: true },
    }),
  ]);
  const skuSnapshotByItemId = new Map(
    listings.map((l) => [l.mlItemId, l.skuSnapshot]),
  );

  return uniqueIds.filter((id) => {
    const resolvedSupplier =
      supplierNames.get(id) ?? getSkuSupplier(skuSnapshotByItemId.get(id));
    return resolvedSupplier === supplier;
  });
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
  options?: { groups?: ListingGroups },
): Promise<Map<string, string | null>> {
  const lines: OrderLineRef[] = items.map((item) => ({ itemId: item.id }));
  const maps = await loadProductResolverMaps(organizationId, lines, { groups: options?.groups });

  const result = new Map<string, string | null>();
  for (const item of items) {
    const resolution = resolveProductForLine({ itemId: item.id }, maps);
    result.set(item.id, resolution.product?.sku ?? item.sku);
  }
  return result;
}
