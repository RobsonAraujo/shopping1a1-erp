import type { CalculatorApi } from "@/lib/calculadora/calculator-api";
import type { CalculatorData, CalculatorListing } from "@/lib/calculadora/calculator-listings";
import type { CalculatorAds, CalculatorReading } from "@/lib/calculadora/reading";
import { listingTypeLabelFromId, roundMoney } from "@/lib/pricing/financial-margin";
import type { MlCostsAtPrice } from "@/lib/pricing/refine-min-sale-price";
import { buildFloorView, type RotinaFloorView } from "@/lib/rotina/floor-view";
import type { RotinaSimulation, RotinaTypeFloor } from "@/lib/rotina/simulate";
import { simulateMarginAtPrice } from "@/lib/rotina/simulate-margin";
import type { SimulatorApi } from "@/lib/rotina/simulator-api";
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
  /** TACOS de 7 dias do Product Ads; 0 = fora do ADS. */
  tacosPercent: number;
  /** TACOS de hoje (o padrão da Calculadora). */
  tacosTodayPercent: number;
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
    tacosTodayPercent: 0,
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
    tacosTodayPercent: 9.5,
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
    tacosTodayPercent: 7.5,
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
    tacosTodayPercent: 6.5,
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
    tacosTodayPercent: 0,
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
    tacosTodayPercent: 11,
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

function inputsOf(
  listing: DemoListing,
  type: DemoListingType,
  tacosPercent: number = listing.tacosPercent,
): RotinaPricingInputs {
  return {
    productCost: listing.productCost,
    extraCosts: 0,
    taxRatePercent: listing.taxRatePercent,
    mlFeeRebate: null,
    listingTypeId: type,
    listingTypeLabel: listingTypeLabelFromId(type),
    adsMetricsAvailable: true,
    tacosPercent,
    adsCost: null,
    adsUnitsSold: null,
  };
}

function marginAt(
  listing: DemoListing,
  type: DemoListingType,
  price: number,
  basis: "contribution" | "afterAds",
  tacosPercent: number,
): number | null {
  const result = simulateMarginAtPrice(
    price,
    demoCostsAt(listing, price, type),
    inputsOf(listing, type, tacosPercent),
    0,
  );
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
  tacosPercent: number = listing.tacosPercent,
): { price: number | null; bands: RotinaFloorBand[] } {
  const ceiling = roundMoney(Math.max(listing.salePrice * 4, 500));
  const ok = (price: number) =>
    (marginAt(listing, type, price, basis, tacosPercent) ?? -Infinity) >= targetPercent - 1e-9;
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
  tacosPercent: number = listing.tacosPercent,
): RotinaFloorView {
  const mc = demoMinPrice(listing, type, targetPercent, "contribution", tacosPercent);
  const afterAds = demoMinPrice(listing, type, targetPercent, "afterAds", tacosPercent);
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
      tacosPercent,
      adsCost: null,
    },
    targetPercent,
  );
}

function toCalculatorListing(listing: DemoListing): CalculatorListing {
  return {
    mlItemId: listing.mlItemId,
    title: listing.title,
    sku: listing.sku,
    imageUrl: listing.imageUrl,
    permalink: "",
    catalogListing: listing.catalogListing,
    mlStatus: "active",
  };
}

export function buildDemoCalculatorData(listings: readonly DemoListing[] = DEMO_LISTINGS): CalculatorData {
  return {
    timeZone: DEMO_TIME_ZONE,
    listings: listings.map(toCalculatorListing),
  };
}

/** "Hoje" e "7 dias" na demonstração: as datas não importam, só o TACOS. */
function demoAds(listing: DemoListing, basis: CalculatorAds["basis"], now: Date): CalculatorAds {
  const day = now.toISOString().slice(0, 10);
  const from = basis === "today" ? day : new Date(now.getTime() - 6 * 86_400_000).toISOString().slice(0, 10);
  const tacosPercent = basis === "today" ? listing.tacosTodayPercent : listing.tacosPercent;
  return {
    basis,
    from,
    to: day,
    available: true,
    tacosPercent,
    adsCost: null,
    adsUnitsSold: null,
    status: tacosPercent > 0 ? "active" : null,
  };
}

/** A "leitura ao vivo" de um anúncio de exemplo: a tabela no lugar do ML. */
export function demoReading(listing: DemoListing, now: Date = new Date()): CalculatorReading {
  return {
    mlItemId: listing.mlItemId,
    readAt: now.toISOString(),
    listingTypeId: listing.listingTypeId,
    price: listing.salePrice,
    regularPrice: listing.regularPrice,
    hasPromotion: listing.regularPrice !== null,
    promotionKnown: true,
    pmaPrice: listing.pmaPrice,
    costsNow: demoCostsAt(listing, listing.salePrice, listing.listingTypeId),
    inputs: inputsOf(listing, listing.listingTypeId),
    taxSource: { regime: "simples" },
    blocked: null,
    catalog: listing.catalogStatus
      ? { status: listing.catalogStatus, priceToWin: listing.priceToWin }
      : null,
    targetPercent: listing.targetPercent,
    ownTarget: listing.ownTarget,
    ads: demoAds(listing, "today", now),
  };
}

/** As chamadas do simulador respondidas no navegador, com o TACOS da base escolhida. */
function demoSimulatorApi(listing: DemoListing, ads: CalculatorAds): SimulatorApi {
  const tacos = ads.tacosPercent ?? 0;
  return {
    async simulate({ mlItemId, prices, listingTypeId }): Promise<RotinaSimulation> {
      const type = listingTypeId ?? listing.listingTypeId;
      const inputs = inputsOf(listing, type, tacos);
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
        inputs: inputsOf(listing, listing.listingTypeId, tacos),
        results: [...new Set(wanted.map((price) => roundMoney(price)))].map((price) =>
          simulateMarginAtPrice(price, demoCostsAt(listing, price, type), inputs, listing.targetPercent),
        ),
      };
    },
    async floor({ mlItemId, listingTypeId, targetPercent }): Promise<RotinaTypeFloor> {
      const type = listingTypeId ?? listing.listingTypeId;
      const target = targetPercent ?? listing.targetPercent;
      return {
        mlItemId,
        listingTypeId: type,
        targetPercent: target,
        blocked: null,
        floor: demoFloorView(listing, type, target, tacos),
      };
    },
  };
}

/** A Calculadora inteira respondida no navegador, pela tabela de exemplo. */
export function createDemoCalculatorApi(
  listings: readonly DemoListing[] = DEMO_LISTINGS,
): CalculatorApi {
  const byId = new Map(listings.map((listing) => [listing.mlItemId, listing]));
  const find = (mlItemId: string): DemoListing => {
    const listing = byId.get(mlItemId);
    if (!listing) throw new Error("Anúncio de exemplo não encontrado.");
    return listing;
  };
  return {
    async read(mlItemId) {
      return demoReading(find(mlItemId));
    },
    async ads7d(mlItemId) {
      return demoAds(find(mlItemId), "7d", new Date());
    },
    simulatorFor(reading, ads) {
      return demoSimulatorApi(find(reading.mlItemId), ads);
    },
  };
}
