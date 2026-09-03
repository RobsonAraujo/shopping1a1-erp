import type { Listing } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { getItemSku } from "@/lib/mercadolibre/item-sku";
import type { ItemBody } from "@/lib/mercadolibre/types";

// Derivado do próprio `prisma` (client com a extensão do tenant-guard) em vez
// de `Prisma.TransactionClient` puro — o `tx` que os call sites recebem de
// `prisma.$transaction(async (tx) => ...)` carrega os tipos da extensão, que
// não são estruturalmente compatíveis com o client base gerado.
type TransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];
type ListingWriteClient = typeof prisma | TransactionClient;

/**
 * Upsert de `Listing` com os campos "gerais" (título, SKU, imagem, status no
 * ML, se é anúncio de catálogo) a partir de um `ItemBody` já buscado na API
 * do ML — não faz nenhuma chamada de rede própria.
 *
 * Não toca nos campos exclusivos do poll de concorrência de catálogo
 * (`catalogStatus`/`catalogSellerPrice`/`catalogPriceToWin`/
 * `catalogPolledAt`) — esses continuam de responsabilidade só de
 * `pollCatalogCompetitionForSeller` (src/lib/catalog-report/catalog-competition-poll.ts).
 *
 * Ponto central de sincronização de `Listing`: antes desta função, 4 lugares
 * diferentes faziam esse upsert de forma independente (código copiado), e só
 * o poll de catálogo capturava `skuSnapshot`/`imageUrlSnapshot` — anúncios
 * fora do catálogo nunca tinham esses campos preenchidos. `skuSnapshot`/
 * `imageUrlSnapshot` aqui são só para exibição (catalog report, thumbnail em
 * "Meus produtos") — identidade de produto é o próprio `Product.mlItemId`
 * (1:1 com o anúncio), independente do ciclo de vida de `Listing`.
 */
export async function upsertListingFromItem(
  organizationId: string,
  item: ItemBody,
  client: ListingWriteClient = prisma,
): Promise<Listing | null> {
  if (!item.id) return null;

  const activeOnMl = item.status === "active" || item.status === "paused";
  const sku = getItemSku(item);
  const imageUrl = bestItemImageUrl(item);

  return client.listing.upsert({
    where: { mlItemId: item.id },
    create: {
      organizationId,
      mlItemId: item.id,
      titleSnapshot: item.title,
      skuSnapshot: sku,
      imageUrlSnapshot: imageUrl ?? null,
      catalogListing: item.catalog_listing ?? null,
      activeOnMl,
      mlStatus: item.status,
      lastSyncedAt: new Date(),
    },
    update: {
      titleSnapshot: item.title,
      // Preserva o valor já gravado se esta leitura não trouxer SKU/imagem
      // (ex.: falha pontual de parsing) — não some um dado bom por um miss.
      skuSnapshot: sku ?? undefined,
      imageUrlSnapshot: imageUrl ?? undefined,
      catalogListing: item.catalog_listing ?? null,
      activeOnMl,
      mlStatus: item.status,
      lastSyncedAt: new Date(),
    },
  });
}

/** Mesma coisa em lote, com concorrência limitada (chunks de 25). */
export async function upsertListingsFromItems(
  organizationId: string,
  items: ItemBody[],
  client: ListingWriteClient = prisma,
): Promise<void> {
  const chunkSize = 25;
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((item) => upsertListingFromItem(organizationId, item, client)),
    );
  }
}
