import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCatalogPollStats } from "@/lib/catalog-report/catalog-competition-poll-stats";
import { apiErrorPayload, logServerError } from "@/lib/server-public-error";
import { requireAuth, unauthorizedResponse } from "@/lib/api-auth";

export async function GET() {
  const auth = await requireAuth();
  if (!auth) return unauthorizedResponse();

  try {
    const [listings, pollStats] = await Promise.all([
      prisma.listing.findMany({
        where: { catalogListing: true },
        select: {
          mlItemId: true,
          titleSnapshot: true,
          skuSnapshot: true,
          imageUrlSnapshot: true,
          mlStatus: true,
          catalogStatus: true,
          catalogSellerPrice: true,
          catalogPriceToWin: true,
          catalogPolledAt: true,
        },
      }),
      getCatalogPollStats(),
    ]);

    const items = listings
      .map((listing) => ({
        mlItemId: listing.mlItemId,
        titleSnapshot: listing.titleSnapshot,
        skuSnapshot: listing.skuSnapshot,
        imageUrlSnapshot: listing.imageUrlSnapshot,
        mlStatus: listing.mlStatus,
        catalogStatus: listing.catalogStatus,
        catalogSellerPrice: listing.catalogSellerPrice
          ? Number(listing.catalogSellerPrice)
          : null,
        catalogPriceToWin: listing.catalogPriceToWin
          ? Number(listing.catalogPriceToWin)
          : null,
        catalogPolledAt: listing.catalogPolledAt?.toISOString() ?? null,
      }))
      .sort((a, b) => {
        const skuA = (a.skuSnapshot ?? a.titleSnapshot ?? a.mlItemId).toLowerCase();
        const skuB = (b.skuSnapshot ?? b.titleSnapshot ?? b.mlItemId).toLowerCase();
        return skuA.localeCompare(skuB, "pt-BR");
      });

    return NextResponse.json({ items, pollStats });
  } catch (e) {
    logServerError("api/reports/catalog-competition", e);
    return NextResponse.json(apiErrorPayload(e, "catalog_report_failed"), {
      status: 502,
    });
  }
}
