import { listingTypeLabelFromId, roundMoney } from "@/lib/pricing/financial-margin";
import type { MlCostsAtPrice } from "@/lib/pricing/refine-min-sale-price";
import type { CalculatorData, CalculatorListing } from "@/lib/rotina/calculator-listings";
import { buildFloorView, type RotinaFloorView } from "@/lib/rotina/floor-view";
import type { RotinaSimulation, RotinaTypeFloor } from "@/lib/rotina/simulate";
import { simulateMarginAtPrice } from "@/lib/rotina/simulate-margin";
import type { SimulatorApi } from "@/lib/rotina/simulator-api";
import {
  PROMO_DISCOUNT_SHORTCUTS,
  buildSimulatorSuggestions,
} from "@/lib/rotina/simulator-suggestions";
import type { CatalogLiveStatus, RotinaFloorBand, RotinaPricingInputs } from "@/lib/rotina/types";

/**
 * Calculadora de demonstração (landing): a mesma tela e a **mesma conta de
 * margem** do painel (`simulateMarginAtPrice`), com anúncios de exemplo e uma
 * tabela simples de taxa e frete do Mercado Livre no lugar da cotação real:
 *
 * - comissão de 12% (Clássico) ou 17% (Premium);
 * - custo fixo por unidade abaixo de R$ 79 (metade do preço até R$ 12,50;
 *   R$ 6,25 até R$ 29; R$ 6,50 até R$ 50; R$ 6,75 até R$ 79);
 * - a partir de R$ 79, frete grátis pago pelo vendedor.
 *
 * Isso reproduz o degrau dos R$ 79 que o painel trata com cotação real, então o
 * "Mínimo" aqui também mostra faixas a evitar. Nada sai do navegador. Puro.
 */

type DemoListingType = "gold_special" | "gold_pro";

const FEE_PERCENT: Record<DemoListingType, number> = { gold_special: 12, gold_pro: 17 };
export const DEMO_FREE_SHIPPING_FROM = 79;
/** Inícios das faixas de custo constante (custo fixo e frete). */
const SEGMENT_STARTS = [0.01, 12.5, 29, 50, DEMO_FREE_SHIPPING_FROM];
const DEMO_TIME_ZONE = "America/Sao_Paulo";

export type DemoListing = {
  mlItemId: string;
  title: string;
  sku: string;
  imageUrl: string;
  catalogListing: boolean;
  listingTypeId: DemoListingType;
  salePrice: number;
  regularPrice: number | null;
  /** Frete que o vendedor paga a partir de R$ 79 (frete grátis). */
  freeShippingCost: number;
  productCost: number;
  taxRatePercent: number;
  /** TACOS do Product Ads; 0 = fora do ADS. */
  tacosPercent: number;
  /** Meta: a própria (`ownTarget`) ou a padrão do segmento. */
  targetPercent: number;
  ownTarget: boolean;
  catalogStatus: CatalogLiveStatus | null;
  priceToWin: number | null;
  pmaPrice: number | null;
};

/** Metas padrão da demonstração (no painel, cada loja define as suas). */
const OWN_TARGET = 8;
const CATALOG_TARGET = 3;

export const DEMO_LISTINGS: DemoListing[] = [
  {
    mlItemId: "MLB4012386517",
    title: "Fone Bluetooth TWS ANC",
    sku: "FONE-BT-01",
    imageUrl: "/marketing/demo-fone.png",
    catalogListing: true,
    listingTypeId: "gold_pro",
    salePrice: 149.9,
    regularPrice: null,
    freeShippingCost: 21.45,
    productCost: 78,
    taxRatePercent: 9,
    tacosPercent: 0,
    targetPercent: CATALOG_TARGET,
    ownTarget: false,
    catalogStatus: "losing",
    priceToWin: 144.9,
    pmaPrice: null,
  },
  {
    mlItemId: "MLB3820417702",
    title: "Kit 3 Cabos USB-C 2m nylon",
    sku: "CABO-USB-C-K3",
    imageUrl: "/marketing/demo-cabo.png",
    catalogListing: false,
    listingTypeId: "gold_pro",
    salePrice: 84.9,
    regularPrice: 94.9,
    freeShippingCost: 21.45,
    productCost: 27,
    taxRatePercent: 9,
    tacosPercent: 7,
    targetPercent: OWN_TARGET,
    ownTarget: false,
    catalogStatus: null,
    priceToWin: null,
    pmaPrice: null,
  },
  {
    mlItemId: "MLB3954102288",
    title: "Capa MagSafe iPhone 14",
    sku: "CAPA-14",
    imageUrl: "/marketing/demo-capa.png",
    catalogListing: false,
    listingTypeId: "gold_pro",
    salePrice: 89.9,
    regularPrice: null,
    freeShippingCost: 19.45,
    productCost: 31,
    taxRatePercent: 9,
    tacosPercent: 9,
    targetPercent: 10,
    ownTarget: true,
    catalogStatus: null,
    priceToWin: null,
    pmaPrice: null,
  },
  {
    mlItemId: "MLB4012390145",
    title: "Fone Bluetooth TWS ANC",
    sku: "FONE-BT-01",
    imageUrl: "/marketing/demo-fone.png",
    catalogListing: false,
    listingTypeId: "gold_special",
    salePrice: 159.9,
    regularPrice: 179.9,
    freeShippingCost: 21.45,
    productCost: 78,
    taxRatePercent: 9,
    tacosPercent: 6,
    targetPercent: OWN_TARGET,
    ownTarget: false,
    catalogStatus: null,
    priceToWin: null,
    pmaPrice: null,
  },
  {
    mlItemId: "MLB3954117730",
    title: "Capa MagSafe iPhone 15",
    sku: "CAPA-15",
    imageUrl: "/marketing/demo-capa.png",
    catalogListing: true,
    listingTypeId: "gold_special",
    salePrice: 79.9,
    regularPrice: null,
    freeShippingCost: 19.45,
    productCost: 33,
    taxRatePercent: 9,
    tacosPercent: 0,
    targetPercent: CATALOG_TARGET,
    ownTarget: false,
    catalogStatus: "shared",
    priceToWin: 78.9,
    pmaPrice: null,
  },
  {
    mlItemId: "MLB3820409961",
    title: "Cabo USB-C 2m nylon",
    sku: "CABO-USB-C",
    imageUrl: "/marketing/demo-cabo.png",
    catalogListing: false,
    listingTypeId: "gold_special",
    salePrice: 29.9,
    regularPrice: null,
    freeShippingCost: 18.95,
    productCost: 9.8,
    taxRatePercent: 9,
    tacosPercent: 8,
    targetPercent: OWN_TARGET,
    ownTarget: false,
    catalogStatus: null,
    priceToWin: null,
    pmaPrice: null,
  },
];

/** Custo fixo por unidade abaixo do frete grátis (tabela simplificada). */
export function demoFixedFee(price: number): number {
  if (price >= DEMO_FREE_SHIPPING_FROM) return 0;
  if (price < 12.5) return roundMoney(price / 2);
  if (price < 29) return 6.25;
  if (price < 50) return 6.5;
  return 6.75;
}

/** Taxa e frete "cotados" pela tabela de exemplo. */
export function demoCostsAt(
  listing: DemoListing,
  price: number,
  type: DemoListingType,
): MlCostsAtPrice {
  return {
    mlFeeAmount: roundMoney((price * FEE_PERCENT[type]) / 100 + demoFixedFee(price)),
    shippingCost: price >= DEMO_FREE_SHIPPING_FROM ? listing.freeShippingCost : 0,
  };
}

function inputsOf(listing: DemoListing, type: DemoListingType): RotinaPricingInputs {
  return {
    productCost: listing.productCost,
    extraCosts: 0,
    taxRatePercent: listing.taxRatePercent,
    mlFeeRebate: null,
    listingTypeId: type,
    listingTypeLabel: listingTypeLabelFromId(type),
    adsMetricsAvailable: true,
    tacosPercent: listing.tacosPercent,
    adsCost: null,
    adsUnitsSold: null,
  };
}

function marginAt(
  listing: DemoListing,
  type: DemoListingType,
  price: number,
  basis: "contribution" | "afterAds",
): number | null {
  const result = simulateMarginAtPrice(price, demoCostsAt(listing, price, type), inputsOf(listing, type), 0);
  return basis === "afterAds" ? result.marginAfterAdsPercent : result.marginPercent;
}

/**
 * Menor preço com a margem ≥ meta e as faixas acima dele onde ela não fecha.
 * Dentro de cada faixa de custo constante a margem só sobe com o preço, então
 * cada uma resolve por bisseção no centavo — a mesma ideia do mínimo do painel.
 */
export function demoMinPrice(
  listing: DemoListing,
  type: DemoListingType,
  targetPercent: number,
  basis: "contribution" | "afterAds",
): { price: number | null; bands: RotinaFloorBand[] } {
  const ceiling = roundMoney(Math.max(listing.salePrice * 4, 500));
  const ok = (price: number) => (marginAt(listing, type, price, basis) ?? -Infinity) >= targetPercent - 1e-9;
  const segments = SEGMENT_STARTS.map((from, index) => ({
    from,
    to: index + 1 < SEGMENT_STARTS.length ? roundMoney(SEGMENT_STARTS[index + 1] - 0.01) : ceiling,
  }));

  const firstValid = (segment: { from: number; to: number }): number | null => {
    if (!ok(segment.to)) return null;
    if (ok(segment.from)) return segment.from;
    let low = segment.from; // não fecha
    let high = segment.to; // fecha
    while (high - low > 0.01 + 1e-9) {
      const middle = roundMoney((low + high) / 2);
      if (middle <= low || middle >= high) break;
      if (ok(middle)) high = middle;
      else low = middle;
    }
    return high;
  };

  let floor: number | null = null;
  const bands: RotinaFloorBand[] = [];
  for (const segment of segments) {
    const first = firstValid(segment);
    if (floor === null) {
      floor = first;
      continue;
    }
    // Acima do piso a faixa inteira deveria fechar; o que não fecha é para evitar.
    if (first === null) bands.push({ from: segment.from, to: segment.to });
    else if (first > segment.from) bands.push({ from: segment.from, to: roundMoney(first - 0.01) });
  }
  return { price: floor, bands };
}

export function demoFloorView(
  listing: DemoListing,
  type: DemoListingType,
  targetPercent: number,
): RotinaFloorView {
  const mc = demoMinPrice(listing, type, targetPercent, "contribution");
  const afterAds = demoMinPrice(listing, type, targetPercent, "afterAds");
  return buildFloorView(
    {
      salePrice: listing.salePrice,
      regularPrice: listing.regularPrice,
      floorTargetPercent: targetPercent,
      floorMcPrice: mc.price,
      floorAfterAdsPrice: afterAds.price,
      floorReason: afterAds.price === null ? "impossible" : "ok",
      floorRefined: true,
      floorBands: afterAds.bands,
      pmaPrice: listing.pmaPrice,
      adsAvailable: true,
      tacosPercent: listing.tacosPercent,
      adsCost: null,
    },
    targetPercent,
  );
}

function toCalculatorListing(listing: DemoListing): CalculatorListing {
  const today = simulateMarginAtPrice(
    listing.salePrice,
    demoCostsAt(listing, listing.salePrice, listing.listingTypeId),
    inputsOf(listing, listing.listingTypeId),
    listing.targetPercent,
  );
  const floor = demoFloorView(listing, listing.listingTypeId, listing.targetPercent);
  const contested = listing.catalogStatus === "losing" || listing.catalogStatus === "shared";
  return {
    mlItemId: listing.mlItemId,
    title: listing.title,
    sku: listing.sku,
    imageUrl: listing.imageUrl,
    permalink: "",
    catalogListing: listing.catalogListing,
    listingTypeId: listing.listingTypeId,
    mlStatus: "active",
    targetPercent: listing.targetPercent,
    ownTarget: listing.ownTarget,
    today: {
      price: listing.salePrice,
      hasPromotion: listing.regularPrice !== null,
      marginPercent: today.marginPercent,
      marginAfterAdsPercent: today.marginAfterAdsPercent,
      decidingBasis: today.decidingBasis,
      decidingMarginPercent:
        today.decidingBasis === "afterAds" ? today.marginAfterAdsPercent : today.marginPercent,
      targetPercent: listing.targetPercent,
      meetsTarget: today.meetsTarget,
      ownTarget: listing.ownTarget,
      floorPrice: floor.effectivePrice,
      floorBoundByPma: floor.boundBy === "pma",
      floorStale: false,
      maxDiscountPercent: floor.maxDiscountPercent,
      exclusionLabel: null,
      catalogStatus: listing.catalogStatus,
      priceToWin: listing.priceToWin,
    },
    suggestions: buildSimulatorSuggestions({
      priceToWin: contested ? listing.priceToWin : null,
      suggestedPrice: null,
      floor,
      salePrice: listing.salePrice,
      discounts: listing.catalogListing ? undefined : PROMO_DISCOUNT_SHORTCUTS,
      raise: null,
    }),
    defaultPrice: listing.salePrice,
  };
}

export function buildDemoCalculatorData(listings: readonly DemoListing[] = DEMO_LISTINGS): CalculatorData {
  return {
    timeZone: DEMO_TIME_ZONE,
    lastCompleteRunLabel: null,
    dataIsFromToday: true,
    listings: listings.map(toCalculatorListing),
  };
}

/** As chamadas do simulador respondidas no navegador, pela tabela de exemplo. */
export function createDemoSimulatorApi(listings: readonly DemoListing[] = DEMO_LISTINGS): SimulatorApi {
  const byId = new Map(listings.map((listing) => [listing.mlItemId, listing]));
  const find = (mlItemId: string): DemoListing => {
    const listing = byId.get(mlItemId);
    if (!listing) throw new Error("Anúncio de exemplo não encontrado.");
    return listing;
  };
  return {
    async simulate({ mlItemId, prices, listingTypeId }): Promise<RotinaSimulation> {
      const listing = find(mlItemId);
      const type = listingTypeId ?? listing.listingTypeId;
      const inputs = inputsOf(listing, type);
      const wanted = prices && prices.length > 0 ? prices : [listing.salePrice];
      return {
        mlItemId,
        targetPercent: listing.targetPercent,
        inputsFrom: "demo",
        inputsAt: null,
        feeRebate: null,
        currentListingTypeId: listing.listingTypeId,
        listingTypeId: type,
        salePrice: listing.salePrice,
        blocked: null,
        results: [...new Set(wanted.map((price) => roundMoney(price)))].map((price) =>
          simulateMarginAtPrice(price, demoCostsAt(listing, price, type), inputs, listing.targetPercent),
        ),
      };
    },
    async floor({ mlItemId, listingTypeId, targetPercent }): Promise<RotinaTypeFloor> {
      const listing = find(mlItemId);
      const type = listingTypeId ?? listing.listingTypeId;
      const target = targetPercent ?? listing.targetPercent;
      return {
        mlItemId,
        listingTypeId: type,
        targetPercent: target,
        blocked: null,
        floor: demoFloorView(listing, type, target),
      };
    },
  };
}
