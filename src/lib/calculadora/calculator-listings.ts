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
  /**
   * Opções de venda: o produto deste anúncio tem mais de uma (Clássico,
   * Premium…). A lista mostra o tipo e põe as opções do produto juntas — cada
   * uma tem preço e tarifa próprios, então a conta continua por anúncio.
   */
  saleOption?: { principalMlItemId: string; label: string; optionsLabel: string };
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
  saleOptions?: ReadonlyMap<string, NonNullable<CalculatorListing["saleOption"]>>,
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
  const listings = [...merged.values()].map((listing) => {
    const row = fromKnown(listing);
    const saleOption = saleOptions?.get(listing.mlItemId);
    return saleOption ? { ...row, saleOption } : row;
  });
  // A–Z pelo título do produto; as opções do mesmo produto ficam juntas.
  const titleOfProduct = new Map<string, string>();
  for (const row of listings) {
    const key = row.saleOption?.principalMlItemId ?? row.mlItemId;
    if (!titleOfProduct.has(key) || row.mlItemId === key) titleOfProduct.set(key, row.title);
  }
  const productKey = (row: CalculatorListing) => row.saleOption?.principalMlItemId ?? row.mlItemId;
  return listings.sort(
    (a, b) =>
      (titleOfProduct.get(productKey(a)) ?? a.title).localeCompare(
        titleOfProduct.get(productKey(b)) ?? b.title,
        "pt-BR",
      ) ||
      productKey(a).localeCompare(productKey(b)) ||
      Number(b.mlItemId === productKey(b)) - Number(a.mlItemId === productKey(a)) ||
      a.mlItemId.localeCompare(b.mlItemId),
  );
}

/** Chave do produto físico do anúncio: o principal das opções de venda, ou o próprio MLB. */
export function calculatorProductKey(listing: CalculatorListing): string {
  return listing.saleOption?.principalMlItemId ?? listing.mlItemId;
}

/** Um produto na lista da Calculadora, com as opções de venda dele. */
export type CalculatorProductGroup = {
  key: string;
  /** O que representa o produto (foto, título): o principal, se está nas opções. */
  lead: CalculatorListing;
  /** Opções que passam no filtro, o principal primeiro (depois Clássico, Premium…). */
  options: CalculatorListing[];
};

/**
 * Lista por **produto**: as opções de venda (Clássico, Premium…) do mesmo
 * produto ficam juntas, para a lista mostrar o produto uma vez e abrir as
 * opções ao clicar. A ordem é a da busca — o produto entra onde aparece a
 * primeira opção encontrada — e as opções mostradas são as do produto que
 * passam no filtro (Próprio/Catálogo), mesmo as que a busca não achou: quem
 * cola o MLB da Premium vê a Premium dentro do produto.
 */
export function groupCalculatorListings(
  matches: readonly CalculatorListing[],
  allListings: readonly CalculatorListing[],
  passes: (listing: CalculatorListing) => boolean = () => true,
): CalculatorProductGroup[] {
  const byKey = new Map<string, CalculatorListing[]>();
  for (const listing of allListings) {
    if (!passes(listing)) continue;
    const key = calculatorProductKey(listing);
    const list = byKey.get(key) ?? [];
    list.push(listing);
    byKey.set(key, list);
  }

  const groups: CalculatorProductGroup[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const key = calculatorProductKey(match);
    if (seen.has(key)) continue;
    seen.add(key);
    const options = [...(byKey.get(key) ?? [match])].sort(
      (a, b) =>
        Number(b.mlItemId === key) - Number(a.mlItemId === key) ||
        (a.saleOption?.label ?? "").localeCompare(b.saleOption?.label ?? "", "pt-BR") ||
        a.mlItemId.localeCompare(b.mlItemId),
    );
    groups.push({ key, lead: options.find((o) => o.mlItemId === key) ?? options[0], options });
  }
  return groups;
}
