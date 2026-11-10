import { roundMoney } from "@/lib/pricing/financial-margin";
import type { RotinaFloorBand, RotinaListingSnapshot } from "@/lib/rotina/types";

/**
 * O "até onde dá para ir" de cada ação. Os dois mínimos (MC e após ADS) vêm
 * calculados da rodada com cotação real do ML; aqui eles viram a resposta que a
 * tela mostra: qual é o piso que vale (margem ou PMA), quanto de desconto isso
 * permite e quais faixas de preço evitar.
 */

export type RotinaFloorReason =
  | "ok"
  | "missing_product_cost"
  | "impossible"
  | "incomplete"
  | "not_computed";

export type RotinaFloorView = {
  /** Meta efetiva de agora (do anúncio ou do segmento). */
  targetPercent: number;
  /** Os mínimos foram calculados com outra meta: "recalcular". */
  stale: boolean;
  mcPrice: number | null;
  afterAdsPrice: number | null;
  /** Por que não há mínimo após ADS (então vale o de MC). */
  afterAdsMissing: "ads_unavailable" | "spend_without_sales" | null;
  /** Mínimo pela margem: após ADS, ou MC quando não há o primeiro. */
  marginFloor: number | null;
  pmaPrice: number | null;
  /** O piso que vale de fato: max(mínimo pela margem, PMA). */
  effectivePrice: number | null;
  boundBy: "margin" | "pma" | null;
  /** Base do desconto de promoção (preço original). */
  discountBase: number | null;
  /** Desconto inteiro máximo (%) sobre a base sem passar do piso. */
  maxDiscountPercent: number | null;
  /** Faixas acima do piso onde a meta não se sustenta. */
  bands: RotinaFloorBand[];
  reason: RotinaFloorReason;
  refined: boolean;
};

function knownReason(reason: string | null): RotinaFloorReason {
  switch (reason) {
    case "ok":
    case "missing_product_cost":
    case "impossible":
    case "incomplete":
      return reason;
    default:
      return "not_computed";
  }
}

export function buildFloorView(
  listing: Pick<
    RotinaListingSnapshot,
    | "salePrice"
    | "regularPrice"
    | "floorTargetPercent"
    | "floorMcPrice"
    | "floorAfterAdsPrice"
    | "floorReason"
    | "floorRefined"
    | "floorBands"
    | "pmaPrice"
    | "adsAvailable"
    | "tacosPercent"
    | "adsCost"
  >,
  targetPercent: number,
): RotinaFloorView {
  const stale =
    listing.floorTargetPercent === null ||
    Math.abs(listing.floorTargetPercent - targetPercent) > 0.001;

  const afterAdsMissing = !listing.adsAvailable
    ? "ads_unavailable"
    : listing.tacosPercent === null && (listing.adsCost ?? 0) > 0
      ? "spend_without_sales"
      : null;

  const marginFloor = listing.floorAfterAdsPrice ?? listing.floorMcPrice;

  let effectivePrice: number | null = marginFloor;
  let boundBy: RotinaFloorView["boundBy"] = marginFloor !== null ? "margin" : null;
  if (
    listing.pmaPrice !== null &&
    (marginFloor === null || listing.pmaPrice > marginFloor)
  ) {
    effectivePrice = listing.pmaPrice;
    boundBy = "pma";
    // PMA dentro de uma faixa proibida: no PMA a meta não fecha, o piso real é
    // o fim da faixa.
    for (const band of listing.floorBands) {
      if (effectivePrice >= band.from && effectivePrice <= band.to) {
        effectivePrice = roundMoney(band.to + 0.01);
        boundBy = "margin";
      }
    }
  }

  const discountBase = listing.regularPrice ?? listing.salePrice;
  let maxDiscountPercent: number | null = null;
  if (effectivePrice !== null && discountBase > 0) {
    maxDiscountPercent =
      effectivePrice >= discountBase
        ? 0
        : Math.floor((1 - effectivePrice / discountBase) * 100);
  }

  // Só as faixas acima do piso interessam (abaixo dele nada vale mesmo).
  const floorPrice = effectivePrice;
  const bands =
    floorPrice === null
      ? []
      : listing.floorBands.filter((band) => band.from > floorPrice);

  return {
    targetPercent,
    stale,
    mcPrice: listing.floorMcPrice,
    afterAdsPrice: listing.floorAfterAdsPrice,
    afterAdsMissing,
    marginFloor,
    pmaPrice: listing.pmaPrice,
    effectivePrice,
    boundBy,
    discountBase: discountBase > 0 ? discountBase : null,
    maxDiscountPercent,
    bands,
    reason: knownReason(listing.floorReason),
    refined: listing.floorRefined,
  };
}

export type CatalogVerdict =
  | {
      kind: "can_win";
      /** Preço sugerido para ganhar (o preço p/ ganhar, ou logo abaixo de uma faixa proibida). */
      suggestedPrice: number;
      /** Folga entre o sugerido e o piso. */
      slack: number;
      /** O preço p/ ganhar caiu numa faixa proibida: o sugerido fica abaixo dela. */
      belowBand: boolean;
    }
  | { kind: "cannot_win"; shortfall: number }
  | { kind: "unknown" };

/**
 * Dá para ganhar o catálogo sem passar do piso? Quem ganha é quem fica no preço
 * p/ ganhar ou abaixo dele — então, se esse preço cair numa faixa proibida
 * (logo acima do limiar do frete), ficar logo abaixo da faixa ganha E sustenta a
 * meta.
 */
export function catalogVerdict(
  floor: RotinaFloorView | null,
  priceToWin: number | null,
): CatalogVerdict {
  if (!floor || floor.effectivePrice === null || priceToWin === null) {
    return { kind: "unknown" };
  }
  const effective = floor.effectivePrice;
  if (priceToWin < effective - 0.005) {
    return { kind: "cannot_win", shortfall: roundMoney(effective - priceToWin) };
  }

  const band = floor.bands.find(
    (candidate) => priceToWin >= candidate.from && priceToWin <= candidate.to,
  );
  if (band) {
    const belowBand = roundMoney(band.from - 0.01);
    if (belowBand >= effective) {
      return {
        kind: "can_win",
        suggestedPrice: belowBand,
        slack: roundMoney(belowBand - effective),
        belowBand: true,
      };
    }
    return { kind: "cannot_win", shortfall: roundMoney(effective - belowBand) };
  }

  return {
    kind: "can_win",
    suggestedPrice: priceToWin,
    slack: roundMoney(priceToWin - effective),
    belowBand: false,
  };
}
