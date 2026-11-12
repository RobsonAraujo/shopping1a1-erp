/**
 * Tipos compartilhados da Rotina (server e client). Datas viajam como ISO
 * string: tudo aqui atravessa a fronteira RSC → client sem conversão.
 */

import type { CatalogCompetitionSummary } from "@/lib/catalog-report/catalog-competitors";
import type { PromotionWindow } from "@/lib/mercadolibre/promotion-coverage";

export type RotinaFloorBand = { from: number; to: number };

/**
 * O que a conta de margem precisa além de taxa e frete (que dependem do preço
 * e são cotados na hora). Guardado na rodada para o simulador de preço.
 */
export type RotinaPricingInputs = {
  productCost: number | null;
  extraCosts: number | null;
  taxRatePercent: number | null;
  /** Desconto de tarifa da última venda (só em anúncio com promoção). */
  mlFeeRebate: number | null;
  listingTypeLabel: string | null;
  adsMetricsAvailable: boolean;
  tacosPercent: number | null;
  adsCost: number | null;
  adsUnitsSold: number | null;
};

/** Uma linha de `ListingHealth`, já decodificada (Decimal → number, Date → ISO). */
export type RotinaListingSnapshot = {
  mlItemId: string;
  title: string;
  sku: string | null;
  imageUrl: string | null;
  permalink: string;
  catalogListing: boolean;
  mlStatus: string;
  salePrice: number;
  regularPrice: number | null;
  promotionKnown: boolean;
  hasPromotion: boolean;
  promotionName: string | null;
  promotionType: string | null;
  promotionEndsAt: string | null;
  promotionEndKnown: boolean;
  /** Ativas + programadas. `null` = não consultado: vale `promotionEndsAt`. */
  promotionWindows: PromotionWindow[] | null;
  marginPercent: number | null;
  marginValue: number | null;
  marginAfterAdsPercent: number | null;
  marginAfterAdsValue: number | null;
  exclusionReason: string | null;
  floorTargetPercent: number | null;
  floorMcPrice: number | null;
  floorAfterAdsPrice: number | null;
  floorReason: string | null;
  floorRefined: boolean;
  floorBands: RotinaFloorBand[];
  pmaPrice: number | null;
  unitsPerDay: number | null;
  adsAvailable: boolean;
  adsStatus: string | null;
  adsCost: number | null;
  tacosPercent: number | null;
  adsPeriodDays: number;
  tags: string[];
  catalogProductId: string | null;
  relatedItemIds: string[];
  linkedOwnItemId: string | null;
  listedAt: string | null;
  firstSeenAt: string;
  computedAt: string;
  /** Só no servidor (gravação da rodada); não vai para a página. */
  pricingInputs?: RotinaPricingInputs | null;
};

export type CatalogLiveStatus = "winning" | "losing" | "shared" | "unknown";

/** Estado de catálogo ao vivo (`Listing`, mantido pelo cron de catálogo). */
export type RotinaCatalogLive = {
  mlItemId: string;
  title: string | null;
  sku: string | null;
  imageUrl: string | null;
  mlStatus: string | null;
  status: CatalogLiveStatus | null;
  sellerPrice: number | null;
  priceToWin: number | null;
  polledAt: string | null;
  /** Desde quando está no status atual (histórico de snapshots). */
  statusSince: string | null;
  /** O histórico lido não alcança o começo: está assim há mais que a janela. */
  statusSinceTruncated: boolean;
  /** Estava perdendo/dividindo e voltou a ganhar hoje. */
  wonBackToday: boolean;
  /** Produto de catálogo, gravado pelo poll (a rodada também tem, em `ListingHealth`). */
  catalogProductId: string | null;
  /** Ofertas dos concorrentes, lidas pelo poll só enquanto ganha. */
  competition: CatalogCompetitionSummary | null;
  /**
   * Última subida de preço vinda de "ganhando" (histórico de snapshots, até
   * `catalogHistoryDays`): explica um "perdendo" que veio logo depois dela.
   */
  recentRaise: { from: number; to: number; at: string } | null;
};

export type ActionStateStatus =
  | "open"
  | "done"
  | "snoozed"
  | "dismissed"
  | "resolved";

export type ActionStateSnapshot = {
  mlItemId: string;
  rule: string;
  status: ActionStateStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  statusChangedAt: string;
  snoozedUntil: string | null;
  resolvedAt: string | null;
  reopenCount: number;
  relatedItemId: string | null;
};

export type ListingTargetValues = {
  minMarginPercent: number | null;
  tacosTargetPercent: number | null;
};

export type RotinaRunStatus = "running" | "ok" | "partial" | "failed";

export type RotinaRunSummary = {
  id: string;
  status: RotinaRunStatus;
  scope: string;
  startedAt: string;
  finishedAt: string | null;
  heartbeatAt: string;
  itemsDone: number;
  itemsTotal: number;
  errorSummary: string | null;
};
