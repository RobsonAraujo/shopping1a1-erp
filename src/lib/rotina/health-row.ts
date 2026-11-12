import { Prisma, type ListingHealth } from "@/generated/prisma";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import { decimalToNumber } from "@/lib/catalog-report/catalog-competition";
import type { PromotionWindow } from "@/lib/mercadolibre/promotion-coverage";
import type {
  RotinaFloorBand,
  RotinaListingSnapshot,
  RotinaPricingInputs,
} from "@/lib/rotina/types";

function finiteOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Os insumos da conta de margem de uma linha da Lucratividade. */
export function pricingInputsFromRow(row: FinancialEvaluationRow): RotinaPricingInputs {
  return {
    productCost: row.productCost,
    extraCosts: row.extraCosts,
    taxRatePercent: row.taxRatePercent,
    mlFeeRebate: row.mlFeeRebate,
    listingTypeLabel: row.listingTypeLabel,
    adsMetricsAvailable: row.adsMetricsAvailable,
    tacosPercent: row.tacosPercent,
    adsCost: row.adsCost,
    adsUnitsSold: row.adsUnitsSold,
  };
}

/** `pricing_inputs` é Json: valida o formato na leitura. */
export function parsePricingInputs(value: unknown): RotinaPricingInputs | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  return {
    productCost: finiteOrNull(raw.productCost),
    extraCosts: finiteOrNull(raw.extraCosts),
    taxRatePercent: finiteOrNull(raw.taxRatePercent),
    mlFeeRebate: finiteOrNull(raw.mlFeeRebate),
    listingTypeLabel: typeof raw.listingTypeLabel === "string" ? raw.listingTypeLabel : null,
    adsMetricsAvailable: raw.adsMetricsAvailable === true,
    tacosPercent: finiteOrNull(raw.tacosPercent),
    adsCost: finiteOrNull(raw.adsCost),
    adsUnitsSold: finiteOrNull(raw.adsUnitsSold),
  };
}

/** `floor_bands` é Json: dado guardado nunca é fonte de verdade de formato. */
export function parseFloorBands(value: unknown): RotinaFloorBand[] {
  if (!Array.isArray(value)) return [];
  const bands: RotinaFloorBand[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const from = Number((entry as { from?: unknown }).from);
    const to = Number((entry as { to?: unknown }).to);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from) {
      bands.push({ from, to });
    }
  }
  return bands;
}

function isoString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

/** `promotion_windows` é Json: `null` (não consultado) segue `null`. */
export function parsePromotionWindows(value: unknown): PromotionWindow[] | null {
  if (!Array.isArray(value)) return null;
  const windows: PromotionWindow[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const status = raw.status === "started" || raw.status === "pending" ? raw.status : null;
    const endsAt = isoString(raw.endsAt);
    const startsAt = isoString(raw.startsAt);
    if (!status || !endsAt || (status === "pending" && !startsAt)) continue;
    windows.push({
      status,
      name: typeof raw.name === "string" ? raw.name : null,
      type: typeof raw.type === "string" ? raw.type : "UNKNOWN",
      startsAt,
      endsAt,
    });
  }
  return windows;
}

function iso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

export function healthRowToSnapshot(row: ListingHealth): RotinaListingSnapshot {
  return {
    mlItemId: row.mlItemId,
    title: row.title,
    sku: row.sku,
    imageUrl: row.imageUrl,
    permalink: row.permalink,
    catalogListing: row.catalogListing,
    mlStatus: row.mlStatus,
    salePrice: decimalToNumber(row.salePrice) ?? 0,
    regularPrice: decimalToNumber(row.regularPrice),
    promotionKnown: row.promotionKnown,
    hasPromotion: row.hasPromotion,
    promotionName: row.promotionName,
    promotionType: row.promotionType,
    promotionEndsAt: iso(row.promotionEndsAt),
    promotionEndKnown: row.promotionEndKnown,
    promotionWindows: parsePromotionWindows(row.promotionWindows),
    marginPercent: decimalToNumber(row.marginPercent),
    marginValue: decimalToNumber(row.marginValue),
    marginAfterAdsPercent: decimalToNumber(row.marginAfterAdsPercent),
    marginAfterAdsValue: decimalToNumber(row.marginAfterAdsValue),
    exclusionReason: row.exclusionReason,
    floorTargetPercent: decimalToNumber(row.floorTargetPercent),
    floorMcPrice: decimalToNumber(row.floorMcPrice),
    floorAfterAdsPrice: decimalToNumber(row.floorAfterAdsPrice),
    floorReason: row.floorReason,
    floorRefined: row.floorRefined,
    floorBands: parseFloorBands(row.floorBands),
    pmaPrice: decimalToNumber(row.pmaPrice),
    unitsPerDay: decimalToNumber(row.unitsPerDay),
    adsAvailable: row.adsAvailable,
    adsStatus: row.adsStatus,
    adsCost: decimalToNumber(row.adsCost),
    tacosPercent: decimalToNumber(row.tacosPercent),
    adsPeriodDays: row.adsPeriodDays,
    tags: row.tags,
    catalogProductId: row.catalogProductId,
    relatedItemIds: row.relatedItemIds,
    linkedOwnItemId: row.linkedOwnItemId,
    listedAt: iso(row.listedAt),
    firstSeenAt: row.firstSeenAt.toISOString(),
    computedAt: row.computedAt.toISOString(),
  };
}

/** Campos gravados a cada rodada (sem chave, organização e `firstSeenAt`). */
export function snapshotToHealthData(snapshot: RotinaListingSnapshot, runId: string) {
  const date = (value: string | null) => (value ? new Date(value) : null);
  return {
    runId,
    title: snapshot.title,
    sku: snapshot.sku,
    imageUrl: snapshot.imageUrl,
    permalink: snapshot.permalink,
    catalogListing: snapshot.catalogListing,
    mlStatus: snapshot.mlStatus,
    salePrice: snapshot.salePrice,
    regularPrice: snapshot.regularPrice,
    promotionKnown: snapshot.promotionKnown,
    hasPromotion: snapshot.hasPromotion,
    promotionName: snapshot.promotionName,
    promotionType: snapshot.promotionType,
    promotionEndsAt: date(snapshot.promotionEndsAt),
    promotionEndKnown: snapshot.promotionEndKnown,
    // Grava `null` de propósito: janela de uma rodada antiga não pode sobrar
    // num anúncio que saiu da promoção.
    promotionWindows: snapshot.promotionWindows ?? Prisma.DbNull,
    marginPercent: snapshot.marginPercent,
    marginValue: snapshot.marginValue,
    marginAfterAdsPercent: snapshot.marginAfterAdsPercent,
    marginAfterAdsValue: snapshot.marginAfterAdsValue,
    exclusionReason: snapshot.exclusionReason,
    floorTargetPercent: snapshot.floorTargetPercent,
    floorMcPrice: snapshot.floorMcPrice,
    floorAfterAdsPrice: snapshot.floorAfterAdsPrice,
    floorReason: snapshot.floorReason,
    floorRefined: snapshot.floorRefined,
    floorBands: snapshot.floorBands,
    ...(snapshot.pricingInputs ? { pricingInputs: snapshot.pricingInputs } : {}),
    pmaPrice: snapshot.pmaPrice,
    unitsPerDay: snapshot.unitsPerDay,
    adsAvailable: snapshot.adsAvailable,
    adsStatus: snapshot.adsStatus,
    adsCost: snapshot.adsCost,
    tacosPercent: snapshot.tacosPercent,
    adsPeriodDays: snapshot.adsPeriodDays,
    tags: snapshot.tags,
    catalogProductId: snapshot.catalogProductId,
    relatedItemIds: snapshot.relatedItemIds,
    linkedOwnItemId: snapshot.linkedOwnItemId,
    listedAt: date(snapshot.listedAt),
    computedAt: new Date(snapshot.computedAt),
  };
}
