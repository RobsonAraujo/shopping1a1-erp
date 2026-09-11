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

export async function loadCatalogLosingAlerts(
  organizationId: string,
): Promise<CatalogLosingRow[]> {
  const listings = await prisma.listing.findMany({
    where: {
      organizationId,
      catalogListing: true,
      catalogStatus: "losing",
      mlStatus: "active",
    },
    select: {
      mlItemId: true,
      skuSnapshot: true,
      titleSnapshot: true,
      imageUrlSnapshot: true,
      catalogSellerPrice: true,
      catalogPriceToWin: true,
    },
  });

  return buildCatalogLosingRows(listings);
}
