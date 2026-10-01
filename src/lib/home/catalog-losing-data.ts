import {
  catalogPriceGap,
  decimalToNumber,
} from "@/lib/catalog-report/catalog-competition";
import { prisma } from "@/lib/db/db";

export type CatalogLosingRow = {
  mlItemId: string;
  sku: string;
  title: string;
  imageUrl: string | null;
  sellerPrice: number | null;
  priceToWin: number | null;
  gap: number | null;
};

export type CatalogLosingListing = {
  mlItemId: string;
  skuSnapshot: string | null;
  titleSnapshot: string | null;
  imageUrlSnapshot: string | null;
  catalogSellerPrice: unknown;
  catalogPriceToWin: unknown;
};

export function buildCatalogLosingRows(
  listings: CatalogLosingListing[],
): CatalogLosingRow[] {
  return listings
    .map((listing) => {
      const sellerPrice = decimalToNumber(listing.catalogSellerPrice);
      const priceToWin = decimalToNumber(listing.catalogPriceToWin);
      return {
        mlItemId: listing.mlItemId,
        sku: listing.skuSnapshot ?? listing.titleSnapshot ?? listing.mlItemId,
        title: listing.titleSnapshot ?? listing.skuSnapshot ?? listing.mlItemId,
        imageUrl: listing.imageUrlSnapshot,
        sellerPrice,
        priceToWin,
        gap: catalogPriceGap(sellerPrice, priceToWin),
      };
    })
    .sort((a, b) => {
      const gapA = a.gap ?? Number.NEGATIVE_INFINITY;
      const gapB = b.gap ?? Number.NEGATIVE_INFINITY;
      if (gapA !== gapB) return gapB - gapA;
      return a.sku.localeCompare(b.sku, "pt-BR");
    });
}

/** Quantas linhas o snapshot de servidor traz sem ninguém pedir. Tem que ser
 * >= o que o card exibe (`HOME_WIDGET_LIST_CAP`); não importo a constante porque
 * ela mora num módulo `"use client"`. */
export const CATALOG_LOSING_PREVIEW_LIMIT = 5;

/** Teto do "Ver todos". **"Todos" com teto de propósito:** lista sem teto é
 * exatamente o problema que estamos consertando — atrás de um clique continua
 * sendo o mesmo problema, só mais raro. Acima disto o lugar é o relatório, que
 * tem paginação e filtro. */
export const CATALOG_LOSING_FULL_LIMIT = 200;

export type CatalogLosingResult = {
  rows: CatalogLosingRow[];
  /** Total que casa o filtro, independente de quantas linhas vieram. */
  total: number;
};

/**
 * As linhas "perdendo", **ordenadas pelo gap no banco** e cortadas no limite.
 *
 * Por que SQL cru: o ranking é `sellerPrice - priceToWin`, uma expressão entre
 * duas colunas, e o `orderBy` do Prisma não ordena por expressão. Cortar com
 * `take` sem ordenar pelo gap pegaria N linhas **arbitrárias** — as 5 do card
 * deixariam de ser as 5 piores. Seria uma regressão de dado silenciosa, pior que
 * o custo que estamos cortando.
 *
 * `desc nulls last` é obrigatório: no Postgres, `DESC` põe NULL **primeiro**, o
 * contrário do que o JS fazia (anúncio sem preço ia pro fim). O desempate repete
 * o `coalesce` que `buildCatalogLosingRows` usa como sku — a ordem exibida é
 * sempre a do JS, então a colação do Postgres só decide quem **entra** no corte
 * entre gaps iguais.
 *
 * `$queryRaw` **não passa pelo tenant guard** (ele cobre findMany/count/…), então
 * o filtro por `organization_id` aqui é obrigatório e não tem rede de proteção.
 */
function queryLosingListings(
  organizationId: string,
  limit: number,
): Promise<CatalogLosingListing[]> {
  return prisma.$queryRaw<CatalogLosingListing[]>`
    select ml_item_id          as "mlItemId",
           sku_snapshot        as "skuSnapshot",
           title_snapshot      as "titleSnapshot",
           image_url_snapshot  as "imageUrlSnapshot",
           catalog_seller_price as "catalogSellerPrice",
           catalog_price_to_win as "catalogPriceToWin"
      from listings
     where organization_id = ${organizationId}
       and catalog_listing = true
       and catalog_status = 'losing'
       and ml_status = 'active'
     order by (catalog_seller_price - catalog_price_to_win) desc nulls last,
              coalesce(sku_snapshot, title_snapshot, ml_item_id) asc
     limit ${limit}
  `;
}

/**
 * Prévia (ou lista completa, até o teto) + o total.
 *
 * O total vem de um `count` separado porque o card mostra 5 linhas mas o badge e
 * a zona de atenção precisam do número cheio. Antes isto trazia **toda** linha
 * perdendo pra mostrar cinco e chamar `.length` — egress e payload de RSC
 * proporcionais ao catálogo, em toda abertura da Home.
 */
export async function loadCatalogLosingAlerts(
  organizationId: string,
  limit: number = CATALOG_LOSING_PREVIEW_LIMIT,
): Promise<CatalogLosingResult> {
  const [listings, total] = await Promise.all([
    queryLosingListings(organizationId, limit),
    prisma.listing.count({
      where: {
        organizationId,
        catalogListing: true,
        catalogStatus: "losing",
        mlStatus: "active",
      },
    }),
  ]);

  return { rows: buildCatalogLosingRows(listings), total };
}
