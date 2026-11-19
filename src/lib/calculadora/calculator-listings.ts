import { buyerFacingItemPermalink } from "@/lib/mercadolibre/item-permalink";

/**
 * Lista da Calculadora (Financeiro): todos os anúncios da loja numa linha
 * **compacta** — só o que a lista mostra. Os números (preço, margem, TACOS)
 * saem da leitura ao vivo ao abrir um anúncio, não de um retrato. Puro (o I/O
 * fica em `calculator-listings-data.ts`).
 */

/** Parâmetro da URL com o anúncio aberto (`?anuncio=MLB…`). */
export const CALCULATOR_PARAM = "anuncio";

/** "mlb123 " → "MLB123" — servidor e navegador leem a URL do mesmo jeito. */
export function normalizeListingParam(value: string | null | undefined): string | null {
  return value?.trim().toUpperCase() || null;
}

export type CalculatorListing = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  catalogListing: boolean;
  mlStatus: string | null;
};

export type CalculatorData = {
  timeZone: string;
  listings: CalculatorListing[];
};

/** Anúncio cadastrado na loja (`Listing`). */
export type CalculatorKnownListing = {
  mlItemId: string;
  titleSnapshot: string | null;
  skuSnapshot: string | null;
  imageUrlSnapshot: string | null;
  catalogListing: boolean | null;
  mlStatus: string | null;
};

function fromKnown(listing: CalculatorKnownListing): CalculatorListing {
  return {
    mlItemId: listing.mlItemId,
    title: listing.titleSnapshot?.trim() || listing.mlItemId,
    sku: listing.skuSnapshot,
    imageUrl: listing.imageUrlSnapshot,
    permalink: buyerFacingItemPermalink("", listing.mlItemId),
    catalogListing: listing.catalogListing === true,
    mlStatus: listing.mlStatus,
  };
}

/**
 * Por título (A–Z), sem repetir anúncio. Repetido, vale a primeira fonte e os
 * campos vazios dela vêm da seguinte. Os recentes ficam à parte, nos atalhos.
 */
export function toCalculatorListings(
  known: readonly CalculatorKnownListing[],
): CalculatorListing[] {
  const merged = new Map<string, CalculatorKnownListing>();
  for (const listing of known) {
    const current = merged.get(listing.mlItemId);
    if (!current) {
      merged.set(listing.mlItemId, listing);
      continue;
    }
    merged.set(listing.mlItemId, {
      mlItemId: current.mlItemId,
      titleSnapshot: current.titleSnapshot?.trim() ? current.titleSnapshot : listing.titleSnapshot,
      skuSnapshot: current.skuSnapshot ?? listing.skuSnapshot,
      imageUrlSnapshot: current.imageUrlSnapshot ?? listing.imageUrlSnapshot,
      catalogListing: current.catalogListing ?? listing.catalogListing,
      mlStatus: current.mlStatus ?? listing.mlStatus,
    });
  }
  return [...merged.values()]
    .map(fromKnown)
    .sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
}
