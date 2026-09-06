import type { Listing } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/db";
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

type ListingSnapshot = Pick<
  Listing,
  "titleSnapshot" | "skuSnapshot" | "imageUrlSnapshot" | "catalogListing" | "activeOnMl" | "mlStatus"
>;

/**
 * Mesma regra de "o que muda" que `upsertListingFromItem.update` grava —
 * usada só pra decidir se vale a pena escrever, não escreve nada aqui.
 */
function listingSnapshotChanged(existing: ListingSnapshot | undefined, item: ItemBody): boolean {
  if (!existing) return true;

  const activeOnMl = item.status === "active" || item.status === "paused";
  const sku = getItemSku(item);
  const imageUrl = bestItemImageUrl(item) ?? null;

  return (
    existing.titleSnapshot !== item.title ||
    // sku/imageUrl nulos não sobrescrevem o valor gravado (mesma regra do
    // upsert em si) — não conta como mudança.
    (sku !== null && existing.skuSnapshot !== sku) ||
    (imageUrl !== null && existing.imageUrlSnapshot !== imageUrl) ||
    existing.catalogListing !== (item.catalog_listing ?? null) ||
    existing.activeOnMl !== activeOnMl ||
    existing.mlStatus !== item.status
  );
}

/**
 * Mesma coisa em lote, com concorrência limitada (chunks de 25) — mas só
 * escreve os itens cujo snapshot local realmente mudou desde o último sync.
 * Sem isso, todo carregamento de Compras/Operações Full fazia N upserts
 * incondicionais (1 write por item do catálogo operacional), mesmo quando
 * nada tinha mudado desde a última visita.
 */
export async function upsertListingsFromItems(
  organizationId: string,
  items: ItemBody[],
  client: ListingWriteClient = prisma,
): Promise<void> {
  if (items.length === 0) return;

  const existingListings = await client.listing.findMany({
    where: { organizationId, mlItemId: { in: items.map((item) => item.id) } },
    select: {
      mlItemId: true,
      titleSnapshot: true,
      skuSnapshot: true,
      imageUrlSnapshot: true,
      catalogListing: true,
      activeOnMl: true,
      mlStatus: true,
    },
  });
  const existingByItemId = new Map(
    existingListings.map((listing) => [listing.mlItemId, listing]),
  );

  const itemsToSync = items.filter((item) =>
    listingSnapshotChanged(existingByItemId.get(item.id), item),
  );

  const chunkSize = 25;
  for (let i = 0; i < itemsToSync.length; i += chunkSize) {
    const chunk = itemsToSync.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map((item) => upsertListingFromItem(organizationId, item, client)),
    );
  }
}
