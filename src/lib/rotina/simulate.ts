import { prisma } from "@/lib/db/db";
import { decimalToNumber } from "@/lib/catalog-report/catalog-competition";
import { loadFinancialEvaluationRowsForItems } from "@/lib/lucratividade/financial-evaluation-data";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import { fetchItemsByIdsBatched } from "@/lib/mercadolibre/api";
import type { ItemBody } from "@/lib/mercadolibre/types";
import { listingTypeLabelFromId, roundMoney } from "@/lib/pricing/financial-margin";
import { itemAsListingType, resolveMlCostsAtPrice } from "@/lib/pricing/refine-min-sale-price";
import { buildFloorView, type RotinaFloorView } from "@/lib/rotina/floor-view";
import { computeFloorsFromSeed } from "@/lib/rotina/floors";
import { parsePricingInputs, pricingInputsFromRow } from "@/lib/rotina/health-row";
import { loadListingTargets } from "@/lib/rotina/listing-targets";
import { loadRotinaSettings } from "@/lib/rotina/rotina-settings";
import { effectiveMinMarginPercent } from "@/lib/rotina/rules";
import {
  simulateMarginAtPrice,
  type SimulatedPrice,
} from "@/lib/rotina/simulate-margin";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

/**
 * Simulador de preço da Rotina. Custos, imposto, rebate e ADS vêm do retrato
 * da última rodada (`ListingHealth.pricingInputs`); taxa e frete são cotados
 * agora no ML para cada preço — por isso ~1 s por simulação. Sem retrato (ex.:
 * catálogo antes da primeira atualização), monta a linha da Lucratividade na
 * hora, mais lenta.
 *
 * Também simula o outro tipo de anúncio (Clássico ↔ Premium): só a taxa é
 * cotada com o outro `listing_type_id`; frete, custo, imposto, rebate, ADS e
 * meta continuam os de hoje.
 */

/** Os tipos que dá para simular um no lugar do outro. */
export const SIMULATABLE_LISTING_TYPES = ["gold_special", "gold_pro"] as const;
export type SimulatableListingType = (typeof SIMULATABLE_LISTING_TYPES)[number];

export function isSimulatableListingType(
  value: string | null | undefined,
): value is SimulatableListingType {
  return value === "gold_special" || value === "gold_pro";
}

export class RotinaSimulationNotFoundError extends Error {
  constructor() {
    super("rotina_listing_not_found");
  }
}

type SimulationBlock = "missing_cost" | "missing_tax" | "kit_incomplete" | "incomplete" | null;

export type RotinaSimulation = {
  mlItemId: string;
  targetPercent: number;
  /** De onde vieram custo/imposto/ADS. */
  inputsFrom: "refresh" | "live";
  /** Quando esses insumos foram lidos (rodada). */
  inputsAt: string | null;
  /** Rebate de tarifa aplicado em todo preço (só anúncio com promoção). */
  feeRebate: number | null;
  /** Tipo do anúncio hoje, lido do item ao vivo. */
  currentListingTypeId: string | null;
  /** Tipo usado nesta simulação (o de hoje, ou o outro). */
  listingTypeId: string | null;
  /** Sem custo/alíquota/kit completo a conta não vale: nada é simulado. */
  blocked: SimulationBlock;
  results: SimulatedPrice[];
};

/** Mínimo para a meta em outro tipo, já com o PMA aplicado. */
export type RotinaTypeFloor = {
  mlItemId: string;
  listingTypeId: SimulatableListingType;
  blocked: SimulationBlock;
  /** `null` quando o ML não cotou o preço de hoje nesse tipo. */
  floor: RotinaFloorView | null;
};

type SimulationContext = {
  mlItemId: string;
  item: ItemBody;
  targetPercent: number;
  inputs: RotinaPricingInputs;
  inputsFrom: RotinaSimulation["inputsFrom"];
  inputsAt: string | null;
  blocked: SimulationBlock;
  /** Preço de hoje e o que o piso precisa (retrato, ou linha ao vivo). */
  listing: {
    salePrice: number;
    regularPrice: number | null;
    pmaPrice: number | null;
    adsAvailable: boolean;
    tacosPercent: number | null;
    adsCost: number | null;
  };
};

async function loadSimulationContext(
  organizationId: string,
  params: { token: string; userId: number; mlItemId: string },
): Promise<SimulationContext> {
  const { token, userId, mlItemId } = params;

  const [health, listing, settings, targets, items] = await Promise.all([
    prisma.listingHealth.findFirst({
      where: { organizationId, mlItemId },
      select: {
        catalogListing: true,
        exclusionReason: true,
        pricingInputs: true,
        computedAt: true,
        salePrice: true,
        regularPrice: true,
        pmaPrice: true,
        adsAvailable: true,
        tacosPercent: true,
        adsCost: true,
      },
    }),
    prisma.listing.findFirst({
      where: { organizationId, mlItemId },
      select: { catalogListing: true },
    }),
    loadRotinaSettings(organizationId),
    loadListingTargets(organizationId),
    fetchItemsByIdsBatched(token, [mlItemId]),
  ]);
  if (!health && !listing) throw new RotinaSimulationNotFoundError();
  const item = items[0];
  if (!item) throw new RotinaSimulationNotFoundError();

  const catalogListing =
    health?.catalogListing ?? listing?.catalogListing ?? item.catalog_listing === true;
  const targetPercent = effectiveMinMarginPercent(
    catalogListing,
    settings,
    targets.get(mlItemId) ?? null,
  );

  const stored = health ? parsePricingInputs(health.pricingInputs) : null;
  if (health && stored) {
    return {
      mlItemId,
      item,
      targetPercent,
      inputs: stored,
      inputsFrom: "refresh",
      inputsAt: health.computedAt.toISOString(),
      blocked: (health.exclusionReason as SimulationBlock) ?? null,
      listing: {
        salePrice: decimalToNumber(health.salePrice) ?? 0,
        regularPrice: decimalToNumber(health.regularPrice),
        pmaPrice: decimalToNumber(health.pmaPrice),
        adsAvailable: health.adsAvailable,
        tacosPercent: decimalToNumber(health.tacosPercent),
        adsCost: decimalToNumber(health.adsCost),
      },
    };
  }

  const [row] = await loadFinancialEvaluationRowsForItems(token, userId, organizationId, [item]);
  if (!row) throw new RotinaSimulationNotFoundError();
  return {
    mlItemId,
    item,
    targetPercent,
    inputs: pricingInputsFromRow(row),
    inputsFrom: "live",
    inputsAt: null,
    blocked: marginExclusionReason(row),
    listing: {
      salePrice: row.salePrice,
      regularPrice: row.regularPrice,
      pmaPrice: row.pmaPrice,
      adsAvailable: row.adsMetricsAvailable,
      tacosPercent: row.tacosPercent,
      adsCost: row.adsCost,
    },
  };
}

/** Os insumos com o rótulo da taxa do tipo simulado ("Taxa Premium"). */
function inputsForListingType(
  inputs: RotinaPricingInputs,
  currentListingTypeId: string | null,
  listingTypeId: string | null,
): RotinaPricingInputs {
  if (!listingTypeId || listingTypeId === currentListingTypeId) {
    return { ...inputs, listingTypeId: currentListingTypeId ?? inputs.listingTypeId };
  }
  return {
    ...inputs,
    listingTypeId,
    listingTypeLabel: listingTypeLabelFromId(listingTypeId),
  };
}

export async function simulateListingPrices(
  organizationId: string,
  params: {
    token: string;
    userId: number;
    mlItemId: string;
    prices: number[];
    /** Outro tipo (Clássico ↔ Premium). Omitido = o tipo de hoje. */
    listingTypeId?: SimulatableListingType;
  },
): Promise<RotinaSimulation> {
  const { token, userId } = params;
  const prices = [...new Set(params.prices.map((price) => roundMoney(price)))].filter(
    (price) => price > 0,
  );

  const ctx = await loadSimulationContext(organizationId, params);
  const currentListingTypeId = ctx.item.listing_type_id ?? null;
  const listingTypeId = params.listingTypeId ?? currentListingTypeId;
  const inputs = inputsForListingType(ctx.inputs, currentListingTypeId, listingTypeId);

  const base = {
    mlItemId: ctx.mlItemId,
    targetPercent: ctx.targetPercent,
    inputsFrom: ctx.inputsFrom,
    inputsAt: ctx.inputsAt,
    feeRebate: inputs.mlFeeRebate && inputs.mlFeeRebate > 0 ? inputs.mlFeeRebate : null,
    currentListingTypeId,
    listingTypeId,
  };
  if (ctx.blocked) return { ...base, blocked: ctx.blocked, results: [] };

  const results = await Promise.all(
    prices.map(async (price) => {
      const costs = await resolveMlCostsAtPrice(
        token,
        userId,
        ctx.item,
        price,
        ctx.item.currency_id ?? null,
        { listingTypeId },
      ).catch(() => null);
      return simulateMarginAtPrice(price, costs, inputs, ctx.targetPercent);
    }),
  );

  return { ...base, blocked: null, results };
}

/**
 * "Mínimo no Premium": a mesma busca da rodada (MC e após ADS, ciente das
 * faixas de frete), com a taxa do outro tipo e a meta de agora. O PMA segue
 * piso duro. ~20–40 cotações, por isso fica numa chamada à parte.
 */
export async function computeFloorForListingType(
  organizationId: string,
  params: {
    token: string;
    userId: number;
    mlItemId: string;
    listingTypeId: SimulatableListingType;
  },
): Promise<RotinaTypeFloor> {
  const { token, userId, listingTypeId } = params;
  const ctx = await loadSimulationContext(organizationId, params);
  const base = { mlItemId: ctx.mlItemId, listingTypeId };
  if (ctx.blocked) return { ...base, blocked: ctx.blocked, floor: null };

  const { salePrice } = ctx.listing;
  if (salePrice <= 0) return { ...base, blocked: null, floor: null };

  const inputs = inputsForListingType(
    ctx.inputs,
    ctx.item.listing_type_id ?? null,
    listingTypeId,
  );
  const item = itemAsListingType(ctx.item, listingTypeId);
  const seed = await resolveMlCostsAtPrice(
    token,
    userId,
    item,
    salePrice,
    item.currency_id ?? null,
  ).catch(() => null);
  if (!seed) return { ...base, blocked: null, floor: null };

  const today = simulateMarginAtPrice(salePrice, seed, inputs, ctx.targetPercent);
  const floors = await computeFloorsFromSeed(
    token,
    userId,
    item,
    {
      salePrice,
      mlFeeAmount: seed.mlFeeAmount,
      shippingCost: seed.shippingCost,
      inputs,
      currentContributionMarginPercent: today.marginPercent,
      currentAfterAdsMarginPercent: today.marginAfterAdsPercent,
    },
    ctx.targetPercent,
  );

  const floor = buildFloorView(
    {
      salePrice,
      regularPrice: ctx.listing.regularPrice,
      floorTargetPercent: floors.targetPercent,
      floorMcPrice: floors.mcPrice,
      floorAfterAdsPrice: floors.afterAdsPrice,
      floorReason: floors.reason,
      floorRefined: floors.refined,
      floorBands: floors.bands,
      pmaPrice: ctx.listing.pmaPrice,
      adsAvailable: ctx.listing.adsAvailable,
      tacosPercent: ctx.listing.tacosPercent,
      adsCost: ctx.listing.adsCost,
    },
    ctx.targetPercent,
  );
  return { ...base, blocked: null, floor };
}
