import { buyerFacingItemPermalink } from "@/lib/mercadolibre/item-permalink";
import {
  simulatorSetupForListing,
  type SimulatorSuggestion,
} from "@/lib/rotina/simulator-suggestions";
import type { CatalogLiveStatus } from "@/lib/rotina/types";
import type { RotinaListingRow } from "@/lib/rotina/view";

/**
 * Lista da Calculadora (Financeiro): todos os anúncios da plataforma numa
 * linha **compacta** — só o que a lista e a faixa "Hoje" mostram, mais os
 * atalhos do simulador já montados. O `RotinaListingRow` inteiro não viaja
 * para o navegador. Puro (o I/O fica em `calculator-listings-data.ts`).
 */

/** Parâmetro da URL com o anúncio aberto (`?anuncio=MLB…`). */
export const CALCULATOR_PARAM = "anuncio";

/** "mlb123 " → "MLB123" — servidor e navegador leem a URL do mesmo jeito. */
export function normalizeListingParam(value: string | null | undefined): string | null {
  return value?.trim().toUpperCase() || null;
}

/** O retrato da última atualização da Central, mostrado sem chamar o ML. */
export type CalculatorToday = {
  price: number;
  hasPromotion: boolean;
  marginPercent: number | null;
  marginAfterAdsPercent: number | null;
  /** A margem que decide: após ADS, ou MC quando o ADS não serve. */
  decidingBasis: "afterAds" | "contribution";
  decidingMarginPercent: number | null;
  /** Meta efetiva de agora (do anúncio ou do segmento). */
  targetPercent: number;
  /** A margem que decide está na meta? `null` sem margem (ex.: sem custo). */
  meetsTarget: boolean | null;
  ownTarget: boolean;
  /** Mínimo que vale (margem × PMA). */
  floorPrice: number | null;
  floorBoundByPma: boolean;
  /** Mínimo calculado com outra meta: vale de novo no próximo Atualizar. */
  floorStale: boolean;
  maxDiscountPercent: number | null;
  /** Por que não há margem (sem custo, sem alíquota…). */
  exclusionLabel: string | null;
  catalogStatus: CatalogLiveStatus | null;
  priceToWin: number | null;
};

export type CalculatorListing = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  catalogListing: boolean;
  listingTypeId: string | null;
  mlStatus: string | null;
  /**
   * A margem mínima com que a calculadora abre: a meta própria do anúncio, ou
   * a padrão do segmento (Próprio/Catálogo). O usuário mexe à vontade na tela.
   */
  targetPercent: number;
  /** `true` = o anúncio tem meta própria gravada na Central. */
  ownTarget: boolean;
  /** `null` = ainda sem leitura da Central (anúncio novo desde o último Atualizar). */
  today: CalculatorToday | null;
  suggestions: SimulatorSuggestion[];
  /** Preço que o campo já traz; `null` = "Calcular no preço de hoje". */
  defaultPrice: number | null;
};

export type CalculatorData = {
  timeZone: string;
  /** "hoje às 09:12" — de quando são custo, imposto, ADS e a faixa "Hoje". */
  lastCompleteRunLabel: string | null;
  /** A última atualização completa da Central é de hoje (SP)? */
  dataIsFromToday: boolean;
  listings: CalculatorListing[];
};

/** Anúncio cadastrado na plataforma (`Listing`), com ou sem leitura da Central. */
export type CalculatorKnownListing = {
  mlItemId: string;
  titleSnapshot: string | null;
  skuSnapshot: string | null;
  imageUrlSnapshot: string | null;
  catalogListing: boolean | null;
  mlStatus: string | null;
};

function todayOf(row: RotinaListingRow): CalculatorToday {
  const decidingBasis = row.marginAfterAdsPercent !== null ? "afterAds" : "contribution";
  const deciding =
    decidingBasis === "afterAds" ? row.marginAfterAdsPercent : row.marginPercent;
  const targetPercent = row.floor.targetPercent;
  return {
    price: row.salePrice,
    hasPromotion: row.hasPromotion,
    marginPercent: row.marginPercent,
    marginAfterAdsPercent: row.marginAfterAdsPercent,
    decidingBasis,
    decidingMarginPercent: deciding,
    targetPercent,
    meetsTarget: deciding === null ? null : deciding >= targetPercent - 1e-9,
    ownTarget: row.target.own.minMarginPercent !== null,
    floorPrice: row.floor.effectivePrice,
    floorBoundByPma: row.floor.boundBy === "pma",
    floorStale: row.floor.stale,
    maxDiscountPercent: row.floor.maxDiscountPercent,
    exclusionLabel: row.exclusionLabel,
    catalogStatus: row.catalogStatus,
    priceToWin: row.priceToWin,
  };
}

function fromRow(row: RotinaListingRow): CalculatorListing {
  // Mesmos atalhos da aba Anúncios. O campo, porém, abre no preço de hoje:
  // na Calculadora nada roda sozinho, e o ponto de partida neutro é o de hoje
  // (o "Preço p/ ganhar" e o "Mínimo" estão a um clique, nos atalhos).
  const { suggestions } = simulatorSetupForListing(row);
  return {
    mlItemId: row.mlItemId,
    title: row.title,
    sku: row.sku,
    imageUrl: row.imageUrl,
    permalink: row.permalink,
    catalogListing: row.catalogListing,
    listingTypeId: row.listingTypeId,
    mlStatus: row.mlStatus,
    targetPercent: row.floor.targetPercent,
    ownTarget: row.target.own.minMarginPercent !== null,
    today: todayOf(row),
    suggestions,
    defaultPrice: row.salePrice > 0 ? row.salePrice : null,
  };
}

function fromKnown(
  listing: CalculatorKnownListing,
  defaultTargetPercent: (catalogListing: boolean) => number,
): CalculatorListing {
  const catalogListing = listing.catalogListing === true;
  return {
    mlItemId: listing.mlItemId,
    title: listing.titleSnapshot?.trim() || listing.mlItemId,
    sku: listing.skuSnapshot,
    imageUrl: listing.imageUrlSnapshot,
    permalink: buyerFacingItemPermalink("", listing.mlItemId),
    catalogListing,
    listingTypeId: null,
    mlStatus: listing.mlStatus,
    targetPercent: defaultTargetPercent(catalogListing),
    ownTarget: false,
    today: null,
    suggestions: [],
    defaultPrice: null,
  };
}

/**
 * Lidos pela Central primeiro, na ordem de impacto dela (vendas/dia × preço);
 * depois os cadastrados ainda sem leitura, por título. Sem repetir anúncio.
 * `defaultTargetPercent` dá a meta padrão do segmento aos sem leitura.
 */
export function toCalculatorListings(
  rows: readonly RotinaListingRow[],
  known: readonly CalculatorKnownListing[],
  defaultTargetPercent: (catalogListing: boolean) => number,
): CalculatorListing[] {
  const seen = new Set<string>();
  const read: CalculatorListing[] = [];
  for (const row of rows) {
    if (seen.has(row.mlItemId)) continue;
    seen.add(row.mlItemId);
    read.push(fromRow(row));
  }
  const unread: CalculatorListing[] = [];
  for (const listing of known) {
    if (seen.has(listing.mlItemId)) continue;
    seen.add(listing.mlItemId);
    unread.push(fromKnown(listing, defaultTargetPercent));
  }
  unread.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
  return [...read, ...unread];
}
