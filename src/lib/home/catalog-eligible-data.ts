import { dashboardSummaryConfig } from "@/config/dashboard-summary";
import {
  fetchAllUserItemIds,
  fetchItemsByIdsBatched,
} from "@/lib/mercadolibre/api";
import { bestItemImageUrl } from "@/lib/mercadolibre/item-image";
import { buyerFacingItemPermalink } from "@/lib/mercadolibre/item-permalink";
import { getItemSku } from "@/lib/mercadolibre/item-sku";

/** Tag que o Mercado Livre põe no anúncio que pode virar catálogo. */
const CATALOG_ELIGIBLE_TAG = "catalog_listing_eligible";

export type CatalogEligibleRow = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  price: number;
  soldQuantity: number;
};

export type CatalogEligiblePayload = {
  /** Mais vendidos primeiro, até `catalogEligibleListMax`. */
  rows: CatalogEligibleRow[];
  /** O total real, que pode passar do teto da lista. */
  total: number;
  fetchedAt: string;
};

/**
 * Anúncios próprios ativos que o Mercado Livre marcou como elegíveis para virar
 * catálogo. Direto do ML, sem cópia no banco: o filtro é feito por eles, então
 * custa poucas chamadas mesmo num seller grande.
 *
 * Confere a tag em cada anúncio, além de pedir por ela na busca: se o ML ignorasse
 * o parâmetro, a busca devolveria todos os ativos e o card diria que tudo é
 * elegível.
 */
export async function loadCatalogEligibleListings(
  accessToken: string,
  userId: number,
): Promise<CatalogEligiblePayload> {
  const fetchedAt = new Date().toISOString();

  const ids = await fetchAllUserItemIds(accessToken, userId, {
    status: "active",
    tags: CATALOG_ELIGIBLE_TAG,
  });
  if (ids.length === 0) return { rows: [], total: 0, fetchedAt };

  const items = await fetchItemsByIdsBatched(accessToken, ids);
  const eligible = items
    .filter(
      (item) =>
        item.status === "active" &&
        item.catalog_listing !== true &&
        item.tags?.includes(CATALOG_ELIGIBLE_TAG) === true,
    )
    .map<CatalogEligibleRow>((item) => ({
      mlItemId: item.id,
      title: item.title,
      sku: getItemSku(item),
      imageUrl: bestItemImageUrl(item) ?? null,
      permalink: buyerFacingItemPermalink(item.permalink, item.id),
      price: item.price,
      soldQuantity: item.sold_quantity ?? 0,
    }))
    .sort(
      (a, b) =>
        b.soldQuantity - a.soldQuantity ||
        (a.sku ?? a.title).localeCompare(b.sku ?? b.title, "pt-BR"),
    );

  return {
    rows: eligible.slice(0, dashboardSummaryConfig.catalogEligibleListMax),
    total: eligible.length,
    fetchedAt,
  };
}
