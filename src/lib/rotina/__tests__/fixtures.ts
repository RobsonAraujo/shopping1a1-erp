import type { RotinaSettings } from "@/lib/rotina/settings-shared";
import type {
  ActionStateSnapshot,
  RotinaCatalogLive,
  RotinaListingSnapshot,
} from "@/lib/rotina/types";

export const TZ = "America/Sao_Paulo";
/** Terça, 10/11/2026, 12h em São Paulo. */
export const NOW = new Date("2026-11-10T15:00:00.000Z");

export function settings(overrides: Partial<RotinaSettings> = {}): RotinaSettings {
  return {
    ownMinMarginPercent: 2,
    catalogMinMarginPercent: 2,
    ownTacosTargetPercent: 10,
    disabledRules: [],
    promotionExpiringSoonDays: 3,
    salesAverageWindowDays: 30,
    configured: true,
    ...overrides,
  };
}

export function listing(
  overrides: Partial<RotinaListingSnapshot> = {},
): RotinaListingSnapshot {
  return {
    mlItemId: "MLB1",
    title: "Fone X",
    sku: "FONE-X",
    imageUrl: null,
    permalink: "https://produto.mercadolivre.com.br/MLB-1",
    catalogListing: false,
    mlStatus: "active",
    salePrice: 100,
    regularPrice: 120,
    promotionKnown: true,
    hasPromotion: true,
    promotionName: "Oferta",
    promotionType: "PRICE_DISCOUNT",
    promotionEndsAt: "2026-11-30T03:00:00.000Z",
    promotionEndKnown: true,
    promotionWindows: null,
    marginPercent: 15,
    marginValue: 15,
    marginAfterAdsPercent: 12,
    marginAfterAdsValue: 12,
    exclusionReason: null,
    floorTargetPercent: 2,
    floorMcPrice: 80,
    floorAfterAdsPrice: 84,
    floorReason: "ok",
    floorRefined: true,
    floorBands: [],
    pmaPrice: null,
    unitsPerDay: 2,
    adsAvailable: true,
    adsStatus: "active",
    adsCost: 21,
    tacosPercent: 3,
    adsPeriodDays: 7,
    tags: [],
    catalogProductId: null,
    relatedItemIds: [],
    linkedOwnItemId: null,
    listedAt: null,
    firstSeenAt: "2026-11-01T12:00:00.000Z",
    computedAt: "2026-11-10T09:00:00.000Z",
    ...overrides,
  };
}

export function catalogLive(
  overrides: Partial<RotinaCatalogLive> = {},
): RotinaCatalogLive {
  return {
    mlItemId: "MLB9",
    title: "Fone X (catálogo)",
    sku: "FONE-X",
    imageUrl: null,
    mlStatus: "active",
    status: "losing",
    sellerPrice: 99.9,
    priceToWin: 94.9,
    polledAt: "2026-11-10T14:00:00.000Z",
    statusSince: "2026-11-10T13:05:00.000Z",
    statusSinceTruncated: false,
    wonBackToday: false,
    ...overrides,
  };
}

export function state(
  overrides: Partial<ActionStateSnapshot> = {},
): ActionStateSnapshot {
  return {
    mlItemId: "MLB1",
    rule: "promo_missing",
    status: "open",
    firstSeenAt: "2026-11-08T12:00:00.000Z",
    lastSeenAt: "2026-11-10T09:00:00.000Z",
    statusChangedAt: "2026-11-08T12:00:00.000Z",
    snoozedUntil: null,
    resolvedAt: null,
    reopenCount: 0,
    relatedItemId: null,
    ...overrides,
  };
}
