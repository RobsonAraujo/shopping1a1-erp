import { reportsConfig } from "@/config/reports";
import { prisma } from "@/lib/db/db";
import { loadListingGroups } from "@/lib/products/listing-groups";
import { listingOptionLabel, listingOptionsSummary } from "@/lib/products/listing-option-label";
import {
  toCalculatorListings,
  type CalculatorData,
} from "@/lib/calculadora/calculator-listings";

/**
 * Lista da Calculadora — **só banco**, nenhuma chamada ao Mercado Livre.
 *
 * É só um diretório (título, SKU, imagem, segmento): preço, margem e TACOS
 * saem da leitura ao vivo quando o usuário abre um anúncio, nunca de retrato.
 * Junta os anúncios ativos cadastrados (`Listing`) com os que a Central já leu
 * do ML (`ListingHealth`, só os campos de exibição): o `Listing` é preenchido
 * por fluxos avulsos (SKUs, catálogo, estoque) e pode não ter todos.
 */
export async function loadCalculatorListings(organizationId: string): Promise<CalculatorData> {
  const [known, seen, groups] = await Promise.all([
    prisma.listing.findMany({
      where: { organizationId, activeOnMl: true },
      select: {
        mlItemId: true,
        titleSnapshot: true,
        skuSnapshot: true,
        imageUrlSnapshot: true,
        catalogListing: true,
        mlStatus: true,
      },
    }),
    prisma.listingHealth.findMany({
      where: { organizationId },
      select: {
        mlItemId: true,
        title: true,
        sku: true,
        imageUrl: true,
        catalogListing: true,
        mlStatus: true,
      },
    }),
    loadListingGroups(organizationId),
  ]);
  const saleOptions = new Map<string, { principalMlItemId: string; label: string; optionsLabel: string }>();
  for (const options of groups.multiOptionGroups()) {
    const principal = options.find((option) => option.isPrincipal)?.mlItemId;
    if (!principal) continue;
    const optionsLabel = listingOptionsSummary(options);
    for (const option of options) {
      saleOptions.set(option.mlItemId, {
        principalMlItemId: principal,
        label: listingOptionLabel(option, options),
        optionsLabel,
      });
    }
  }
  return {
    timeZone: reportsConfig.catalogCompetitionTimezone,
    listings: toCalculatorListings([
      ...known,
      ...seen.map((row) => ({
        mlItemId: row.mlItemId,
        titleSnapshot: row.title,
        skuSnapshot: row.sku,
        imageUrlSnapshot: row.imageUrl,
        catalogListing: row.catalogListing,
        mlStatus: row.mlStatus,
      })),
    ], saleOptions),
  };
}
