import { rotinaConfig } from "@/config/rotina";
import {
  catalogRaiseQualifies,
  estimateCatalogRaise,
  type CatalogRaiseEstimate,
} from "@/lib/rotina/catalog-raise";
import {
  promotionCoverage,
  type PromotionCoverage,
  type PromotionWindow,
} from "@/lib/mercadolibre/promotion-coverage";
import { localDayDiff } from "@/lib/rotina/time";
import type { RotinaRuleKey } from "@/lib/rotina/rule-registry";
import {
  isRuleEnabled,
  type RotinaSettings,
} from "@/lib/rotina/settings-shared";
import type {
  ListingTargetValues,
  RotinaCatalogLive,
  RotinaFloorBand,
  RotinaListingSnapshot,
} from "@/lib/rotina/types";

/**
 * Predicados das regras — puros, os mesmos na rodada (reconciliação) e na
 * leitura da página (o que aparece). Avaliar na leitura é o que faz uma meta
 * nova valer na hora, sem esperar o próximo "Atualizar".
 */

export function effectiveMinMarginPercent(
  catalogListing: boolean,
  settings: Pick<RotinaSettings, "ownMinMarginPercent" | "catalogMinMarginPercent">,
  target?: ListingTargetValues | null,
): number {
  if (target?.minMarginPercent !== null && target?.minMarginPercent !== undefined) {
    return target.minMarginPercent;
  }
  return catalogListing
    ? settings.catalogMinMarginPercent
    : settings.ownMinMarginPercent;
}

export function effectiveTacosTargetPercent(
  settings: Pick<RotinaSettings, "ownTacosTargetPercent">,
  target?: ListingTargetValues | null,
): number {
  if (target?.tacosTargetPercent !== null && target?.tacosTargetPercent !== undefined) {
    return target.tacosTargetPercent;
  }
  return settings.ownTacosTargetPercent;
}

export type MarginForRules = {
  percent: number | null;
  basis: "afterAds" | "contribution";
  /** Por que caiu para a MC: o ADS não serve para descontar. */
  fallback: "ads_unavailable" | "spend_without_sales" | null;
};

/**
 * A margem que decide "abaixo do mínimo": após ADS. Cai para a MC (com o motivo)
 * quando o Product Ads não respondeu, ou quando houve gasto sem venda — nesse
 * caso o TACOS é indefinido e a Lucratividade trata como 0%, o que faria a
 * "após ADS" parecer igual à MC justamente no anúncio que mais queima dinheiro.
 */
export function marginForRules(
  listing: Pick<
    RotinaListingSnapshot,
    | "exclusionReason"
    | "marginPercent"
    | "marginAfterAdsPercent"
    | "adsAvailable"
    | "tacosPercent"
    | "adsCost"
  >,
): MarginForRules {
  if (listing.exclusionReason) {
    return { percent: null, basis: "contribution", fallback: null };
  }
  if (!listing.adsAvailable) {
    return {
      percent: listing.marginPercent,
      basis: "contribution",
      fallback: "ads_unavailable",
    };
  }
  if (listing.tacosPercent === null && (listing.adsCost ?? 0) > 0) {
    return {
      percent: listing.marginPercent,
      basis: "contribution",
      fallback: "spend_without_sales",
    };
  }
  if (listing.marginAfterAdsPercent !== null) {
    return {
      percent: listing.marginAfterAdsPercent,
      basis: "afterAds",
      fallback: null,
    };
  }
  return { percent: listing.marginPercent, basis: "contribution", fallback: null };
}

export type ListingPromotionCoverage = {
  /** Quando o anúncio fica de fato sem promoção. */
  endsAt: string | null;
  /** A promoção que termina por último na cobertura (`null` sem as janelas). */
  last: PromotionWindow | null;
  /** Programadas que emendam na ativa. */
  extendedBy: PromotionWindow[];
  nextAfterGap: PromotionCoverage["nextAfterGap"];
};

/**
 * Ativa + programadas que emendam. Sem as janelas (linha de antes da coluna,
 * ou a consulta não trouxe nenhuma ativa), vale a data da ativa, como antes.
 */
export function listingPromotionCoverage(
  listing: Pick<RotinaListingSnapshot, "promotionEndsAt" | "promotionWindows">,
  timeZone: string,
): ListingPromotionCoverage {
  const fallback: ListingPromotionCoverage = {
    endsAt: listing.promotionEndsAt,
    last: null,
    extendedBy: [],
    nextAfterGap: null,
  };
  if (!listing.promotionWindows) return fallback;
  const coverage = promotionCoverage(listing.promotionWindows, timeZone);
  if (!coverage.coveredUntil) return fallback;
  const endsAtMs = new Date(coverage.coveredUntil).getTime();
  const last =
    coverage.extendedBy.at(-1) ??
    listing.promotionWindows.find(
      (window) =>
        window.status === "started" && new Date(window.endsAt).getTime() === endsAtMs,
    ) ??
    null;
  return {
    endsAt: coverage.coveredUntil,
    last,
    extendedBy: coverage.extendedBy,
    nextAfterGap: coverage.nextAfterGap,
  };
}

/** Dias até o anúncio ficar sem promoção (contando as programadas que emendam). */
export function promotionDaysLeft(
  listing: Pick<RotinaListingSnapshot, "promotionEndsAt" | "promotionWindows">,
  now: Date,
  timeZone: string,
): number | null {
  const { endsAt } = listingPromotionCoverage(listing, timeZone);
  if (!endsAt) return null;
  const end = new Date(endsAt);
  if (!Number.isFinite(end.getTime())) return null;
  return localDayDiff(now, end, timeZone);
}

export type RuleContext = {
  settings: RotinaSettings;
  target: ListingTargetValues | null;
  now: Date;
  timeZone: string;
};

/** Regras de condição avaliadas sobre o retrato da rodada. */
export function evaluateRefreshRules(
  listing: RotinaListingSnapshot,
  ctx: RuleContext,
): RotinaRuleKey[] {
  if (listing.mlStatus !== "active") return [];
  const hits: RotinaRuleKey[] = [];
  const own = !listing.catalogListing;

  if (own && listing.promotionKnown) {
    if (!listing.hasPromotion) {
      hits.push("promo_missing");
    } else {
      const days = promotionDaysLeft(listing, ctx.now, ctx.timeZone);
      if (
        days !== null &&
        days >= 0 &&
        days <= ctx.settings.promotionExpiringSoonDays
      ) {
        hits.push("promo_expiring");
      }
    }
  }

  if (own && listing.adsAvailable) {
    if (listing.adsStatus !== "active") {
      hits.push("ads_missing");
    } else {
      const tacosTarget = effectiveTacosTargetPercent(ctx.settings, ctx.target);
      const spendWithoutSales =
        listing.tacosPercent === null && (listing.adsCost ?? 0) > 0;
      if (
        spendWithoutSales ||
        (listing.tacosPercent !== null && listing.tacosPercent > tacosTarget)
      ) {
        hits.push("tacos_above");
      }
    }
  }

  const margin = marginForRules(listing);
  const minMargin = effectiveMinMarginPercent(
    listing.catalogListing,
    ctx.settings,
    ctx.target,
  );
  if (margin.percent !== null && margin.percent < minMargin) {
    hits.push("margin_below_min");
  }

  if (listing.pmaPrice !== null && listing.salePrice < listing.pmaPrice - 0.005) {
    hits.push("below_pma");
  }

  return hits.filter((rule) => isRuleEnabled(ctx.settings, rule));
}

export type CatalogRuleSettings = Pick<
  RotinaSettings,
  "disabledRules" | "catalogRaiseCushionPercent" | "catalogRaiseMinPercent"
>;

export type CatalogRuleContext = {
  now: Date;
  /** Faixas conhecidas em que o frete passa a ser seu (da rodada). */
  bands?: readonly RotinaFloorBand[];
};

/** Estimativa de subida de um catálogo ativo (null fora de "ganhando" ou sem concorrentes frescos). */
export function catalogRaiseFor(
  catalog: RotinaCatalogLive | null,
  settings: Pick<RotinaSettings, "catalogRaiseCushionPercent">,
  ctx: CatalogRuleContext,
): CatalogRaiseEstimate | null {
  if (!catalog || catalog.mlStatus !== "active") return null;
  return estimateCatalogRaise({
    status: catalog.status,
    sellerPrice: catalog.sellerPrice,
    competition: catalog.competition,
    now: ctx.now,
    cushionPercent: settings.catalogRaiseCushionPercent,
    maxAgeMs: rotinaConfig.catalogCompetitorsMaxAgeMs,
    bands: ctx.bands,
  });
}

/** Regras de catálogo, sobre o status ao vivo do cron. */
export function evaluateCatalogRules(
  catalog: RotinaCatalogLive | null,
  settings: CatalogRuleSettings,
  ctx: CatalogRuleContext,
): RotinaRuleKey[] {
  if (!catalog?.status || catalog.mlStatus !== "active") return [];
  const hits: RotinaRuleKey[] = [];
  if (catalog.status === "losing") hits.push("catalog_losing");
  if (catalog.status === "shared") hits.push("catalog_shared");
  if (
    catalogRaiseQualifies(
      catalogRaiseFor(catalog, settings, ctx),
      settings.catalogRaiseMinPercent,
    )
  ) {
    hits.push("catalog_raise_price");
  }
  return hits.filter((rule) => isRuleEnabled(settings, rule));
}
