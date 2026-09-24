import { prisma } from "@/lib/db/db";
import { logServerError } from "@/lib/infra/server-public-error";
import { fetchItemsByIds } from "@/lib/mercadolibre/api";
import { mapWithConcurrency } from "@/lib/mercadolibre/concurrency";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import { upsertListingsFromItems } from "@/lib/mercadolibre/listing-sync";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";

/** Limite do multiget `/items?ids=` do ML. */
const FETCH_CHUNK_SIZE = 20;
const FETCH_CONCURRENCY = 8;
/** Mesmo tamanho de lote de escrita usado em `upsertListingsFromItems`. */
const WRITE_CHUNK_SIZE = 25;

export type SkuSyncUpdate = {
  mlItemId: string;
  from: string | null;
  to: string;
};

export type SkuSyncResult = {
  /** Produtos cujo `sku` foi reescrito com o valor atual do anúncio. */
  updated: SkuSyncUpdate[];
  /** Produtos cujo SKU no ML é igual ao já gravado. */
  unchanged: number;
  /** Anúncio existe, mas não tem SKU preenchido no ML — valor gravado preservado. */
  withoutSku: string[];
  /** Anúncio não voltou no multiget (deletado/sem acesso) — valor gravado preservado. */
  notFound: string[];
  /** Lotes que falharam na chamada ao ML; os produtos deles não foram avaliados. */
  failedBatches: number;
};

function emptyResult(): SkuSyncResult {
  return {
    updated: [],
    unchanged: 0,
    withoutSku: [],
    notFound: [],
    failedBatches: 0,
  };
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Re-lê o SKU atual dos anúncios no Mercado Livre e atualiza `Product.sku`.
 *
 * `Product.sku` é espelho de exibição do anúncio (identidade é `mlItemId`), e
 * até aqui só era capturado no cadastro — se o vendedor trocasse o SKU no ML,
 * o ERP ficava com o valor antigo para sempre. Esta é a única escrita de
 * `Product.sku` fora da criação.
 *
 * Regras de preservação (mesma doutrina de `upsertListingFromItem`): SKU vazio
 * no ML ou anúncio que não voltou do multiget **não apagam** o valor gravado —
 * um miss pontual não pode sumir com um dado bom.
 *
 * Tolerante a falha: cada lote do multiget é isolado num try/catch próprio, em
 * vez de usar `fetchItemsByIdsBatched` (que roda sobre `Promise.all` e derruba
 * a operação inteira quando um único lote falha). Num sync de milhares de
 * anúncios, um 500 pontual do ML não pode perder todo o resto.
 */
export async function syncProductSkusFromMl(
  organizationId: string,
  token: string,
  mlItemIds: string[],
): Promise<SkuSyncResult> {
  const result = emptyResult();
  const uniqueIds = [...new Set(mlItemIds.filter(Boolean))];
  if (uniqueIds.length === 0) return result;

  const products = await prisma.product.findMany({
    where: { organizationId, mlItemId: { in: uniqueIds } },
    select: { mlItemId: true, sku: true },
  });
  if (products.length === 0) return result;

  const currentSkuByItemId = new Map(products.map((p) => [p.mlItemId, p.sku]));
  const idsToFetch = products.map((p) => p.mlItemId);

  // O mapper nunca rejeita, então `mapWithConcurrency` (Promise.all por dentro)
  // não aborta os outros lotes.
  const batches = await mapWithConcurrency(
    chunk(idsToFetch, FETCH_CHUNK_SIZE),
    FETCH_CONCURRENCY,
    async (ids) => {
      try {
        return { items: await fetchItemsByIds(token, ids), failedIds: [] as string[] };
      } catch (e) {
        logServerError("product-sku-sync items multiget", e);
        return { items: [] as ItemBody[], failedIds: ids };
      }
    },
  );

  const items: ItemBody[] = [];
  const failedIds = new Set<string>();
  for (const batch of batches) {
    items.push(...batch.items);
    for (const id of batch.failedIds) failedIds.add(id);
    if (batch.failedIds.length > 0) result.failedBatches += 1;
  }

  const skuByItemId = new Map<string, string | null>();
  for (const item of items) {
    if (!item.id) continue;
    skuByItemId.set(item.id, getItemSku(item));
  }

  const updates: SkuSyncUpdate[] = [];
  for (const mlItemId of idsToFetch) {
    if (failedIds.has(mlItemId)) continue;
    if (!skuByItemId.has(mlItemId)) {
      result.notFound.push(mlItemId);
      continue;
    }
    const nextSku = skuByItemId.get(mlItemId) ?? null;
    if (!nextSku) {
      result.withoutSku.push(mlItemId);
      continue;
    }
    const current = currentSkuByItemId.get(mlItemId) ?? null;
    if (current !== null && normalizeProductSku(current) === nextSku) {
      result.unchanged += 1;
      continue;
    }
    updates.push({ mlItemId, from: current, to: nextSku });
  }

  for (const writeChunk of chunk(updates, WRITE_CHUNK_SIZE)) {
    await Promise.all(
      writeChunk.map((update) =>
        prisma.product.update({
          where: { mlItemId: update.mlItemId, organizationId },
          data: { sku: update.to },
        }),
      ),
    );
  }
  result.updated = updates;

  // Os `ItemBody` já estão em mãos e `upsertListingsFromItems` só escreve o que
  // mudou — título/imagem/status do anúncio saem de graça nesta mesma passada.
  // Falha aqui não invalida o sync de SKU, que já foi gravado.
  try {
    await upsertListingsFromItems(organizationId, items);
  } catch (e) {
    logServerError("product-sku-sync upsertListingsFromItems", e);
  }

  return result;
}
