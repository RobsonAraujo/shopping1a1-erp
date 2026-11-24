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
  // Opções de venda (mesmo `user_product_id`): uma opção que "perde" para a
  // outra opção do mesmo produto não é catálogo perdendo — o produto está
  // ganhando. E um produto com duas opções perdendo conta uma vez, pela opção
  // mais perto de ganhar (menor diferença de preço).
  return prisma.$queryRaw<CatalogLosingListing[]>`
    select "mlItemId", "skuSnapshot", "titleSnapshot", "imageUrlSnapshot",
           "catalogSellerPrice", "catalogPriceToWin"
      from (
        select distinct on (coalesce(l.user_product_id, l.ml_item_id))
               l.ml_item_id           as "mlItemId",
               l.sku_snapshot         as "skuSnapshot",
               l.title_snapshot       as "titleSnapshot",
               l.image_url_snapshot   as "imageUrlSnapshot",
               l.catalog_seller_price as "catalogSellerPrice",
               l.catalog_price_to_win as "catalogPriceToWin"
          from listings l
         where l.organization_id = ${organizationId}
           and l.catalog_listing = true
           and l.catalog_status = 'losing'
           and l.ml_status = 'active'
           and not exists (
             select 1 from listings s
              where s.organization_id = l.organization_id
                and s.user_product_id = l.user_product_id
                and s.ml_item_id <> l.ml_item_id
                and s.catalog_status in ('winning', 'shared')
                and s.ml_status = 'active'
           )
         order by coalesce(l.user_product_id, l.ml_item_id),
                  (l.catalog_seller_price - l.catalog_price_to_win) asc nulls last
      ) by_product
     order by ("catalogSellerPrice" - "catalogPriceToWin") desc nulls last,
              coalesce("skuSnapshot", "titleSnapshot", "mlItemId") asc
     limit ${limit}
  `;
}

/** Quantos produtos estão perdendo o catálogo (mesma regra de `queryLosingListings`). */
async function countLosingProducts(organizationId: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ total: bigint }>>`
    select count(distinct coalesce(l.user_product_id, l.ml_item_id)) as total
      from listings l
     where l.organization_id = ${organizationId}
       and l.catalog_listing = true
       and l.catalog_status = 'losing'
       and l.ml_status = 'active'
       and not exists (
         select 1 from listings s
          where s.organization_id = l.organization_id
            and s.user_product_id = l.user_product_id
            and s.ml_item_id <> l.ml_item_id
            and s.catalog_status in ('winning', 'shared')
            and s.ml_status = 'active'
       )
  `;
  return Number(rows[0]?.total ?? 0);
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
    countLosingProducts(organizationId),
  ]);

  return { rows: buildCatalogLosingRows(listings), total };
}
