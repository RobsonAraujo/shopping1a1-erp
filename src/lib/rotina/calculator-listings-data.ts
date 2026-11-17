import { prisma } from "@/lib/db/db";
import {
  toCalculatorListings,
  type CalculatorData,
} from "@/lib/rotina/calculator-listings";
import { loadRotinaView } from "@/lib/rotina/rotina-view-data";
import { effectiveMinMarginPercent } from "@/lib/rotina/rules";

/**
 * Leitura da Calculadora — **só banco**, nenhuma chamada ao Mercado Livre.
 *
 * Reaproveita a leitura da Central (`loadRotinaView`) em vez de montar outra:
 * piso com PMA, meta própria, status e teto do catálogo saem com os mesmos
 * números da aba Anúncios, sem duplicar derivação. Os anúncios cadastrados
 * ainda sem leitura vêm de `Listing`, só com as colunas da lista.
 */
export async function loadCalculatorListings(organizationId: string): Promise<CalculatorData> {
  const [view, known] = await Promise.all([
    loadRotinaView(organizationId),
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
  ]);
  return {
    timeZone: view.timeZone,
    lastCompleteRunLabel: view.lastCompleteRunLabel,
    dataIsFromToday: view.dataIsFromToday,
    listings: toCalculatorListings(view.listings, known, (catalogListing) =>
      effectiveMinMarginPercent(catalogListing, view.settings, null),
    ),
  };
}
