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
import { inputsWithAds, type TacosAds, type TacosBasis } from "@/lib/pricing/tacos-basis";
import { loadListingAds } from "@/lib/pricing/tacos-basis-data";

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

export type SimulationBlock = "missing_cost" | "missing_tax" | "kit_incomplete" | "incomplete" | null;

export type RotinaSimulation = {
  mlItemId: string;
  targetPercent: number;
  /** De onde vieram custo/imposto/ADS (`demo` = exemplo da landing, sem ML). */
  inputsFrom: "refresh" | "live" | "demo";
  /** Quando esses insumos foram lidos (rodada). */
  inputsAt: string | null;
  /** Rebate de tarifa aplicado em todo preço (só anúncio com promoção). */
  feeRebate: number | null;
  /** Tipo do anúncio hoje, lido do item ao vivo. */
  currentListingTypeId: string | null;
  /** Tipo usado nesta simulação (o de hoje, ou o outro). */
  listingTypeId: string | null;
  /** Preço de hoje (retrato, ou linha ao vivo) — o simulado quando não vêm preços. */
  salePrice: number | null;
  /** Sem custo/alíquota/kit completo a conta não vale: nada é simulado. */
  blocked: SimulationBlock;
  /**
   * Os insumos da conta (custo, imposto, rebate, ADS), no tipo de hoje. Com
   * eles o navegador refaz os preços já cotados com outro TACOS (hoje ↔ 7
   * dias) sem cotar de novo. Ausente na demonstração antiga.
   */
  inputs?: RotinaPricingInputs;
  results: SimulatedPrice[];
};

/** Mínimo para uma meta num tipo (o de hoje ou o outro), já com o PMA aplicado. */
export type RotinaTypeFloor = {
  mlItemId: string;
  /** Tipo cotado: o pedido, ou o de hoje. */
  listingTypeId: string | null;
  /** A meta usada: a pedida, ou a efetiva do anúncio. */
  targetPercent: number;
  blocked: SimulationBlock;
  /** `null` quando o ML não cotou o preço de hoje nesse tipo. */
  floor: RotinaFloorView | null;
};

/**
 * Tudo o que a conta precisa de um anúncio: o item ao vivo (para cotar taxa e
 * frete), os insumos (custo, imposto, rebate, ADS) e o preço de hoje. A Central
 * monta pelo retrato (`loadSimulationContext`); a Calculadora, pela leitura ao
 * vivo que ela já fez.
 */
export type SimulationContext = {
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

/**
 * Os preços a cotar: os pedidos (arredondados, sem repetir), ou o de hoje
 * quando nenhum veio — a Calculadora abre um anúncio ainda sem leitura assim.
 */
export function resolveSimulationPrices(
  requested: number[] | undefined,
  salePrice: number | null,
): number[] {
  const source =
    requested && requested.length > 0 ? requested : salePrice !== null ? [salePrice] : [];
  return [...new Set(source.map((price) => roundMoney(price)))].filter((price) => price > 0);
}

export async function simulateListingPrices(
  organizationId: string,
  params: {
    token: string;
    userId: number;
    mlItemId: string;
    /** Omitido ou vazio = o preço de hoje. */
    prices?: number[];
    /** Outro tipo (Clássico ↔ Premium). Omitido = o tipo de hoje. */
    listingTypeId?: SimulatableListingType;
  },
): Promise<RotinaSimulation> {
  const ctx = await loadSimulationContext(organizationId, params);
  return simulateWithContext(ctx, params);
}

/** A simulação com o contexto já montado (retrato da Central ou leitura da Calculadora). */
export async function simulateWithContext(
  ctx: SimulationContext,
  params: {
    token: string;
    userId: number;
    /** Omitido ou vazio = o preço de hoje. */
    prices?: number[];
    /** Outro tipo (Clássico ↔ Premium). Omitido = o tipo de hoje. */
    listingTypeId?: SimulatableListingType;
  },
): Promise<RotinaSimulation> {
  const { token, userId } = params;
  const salePrice = ctx.listing.salePrice > 0 ? ctx.listing.salePrice : null;
  const prices = resolveSimulationPrices(params.prices, salePrice);
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
    salePrice,
    inputs: { ...ctx.inputs, listingTypeId: currentListingTypeId ?? ctx.inputs.listingTypeId },
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
 * Mínimo para uma meta: a mesma busca da rodada (MC e após ADS, ciente das
 * faixas de frete), no tipo pedido (ou no de hoje) e com a meta pedida (ou a
 * efetiva). Serve o "Mínimo no Premium" e o "Calcular mínimo p/ X%" da
 * Calculadora. O PMA segue piso duro. ~20–40 cotações, por isso fica numa
 * chamada à parte, só quando o usuário pede (ou troca de tipo).
 */
export async function computeSimulationFloor(
  organizationId: string,
  params: {
    token: string;
    userId: number;
    mlItemId: string;
    /** Omitido = o tipo de hoje. */
    listingTypeId?: SimulatableListingType;
    /** Omitida = a meta efetiva do anúncio. */
    targetPercent?: number;
    /**
     * `today` = o mínimo com o TACOS de hoje, lido agora (o retrato da Central
     * é de 7 dias). Omitido = o do retrato.
     */
    tacosBasis?: TacosBasis;
  },
): Promise<RotinaTypeFloor> {
  const snapshot = await loadSimulationContext(organizationId, params);
  const ctx =
    params.tacosBasis === "today"
      ? contextWithAds(snapshot, await loadListingAds(params.token, params.mlItemId, "today"))
      : snapshot;
  return floorWithContext(ctx, params);
}

/**
 * O ADS de um anúncio da loja agora, numa base: o "Hoje" do simular da Central
 * (o retrato é de 7 dias). Só anúncio que a Central conhece.
 */
export async function readSimulationAds(
  organizationId: string,
  params: { token: string; mlItemId: string; basis: TacosBasis },
): Promise<TacosAds> {
  const [health, listing] = await Promise.all([
    prisma.listingHealth.findFirst({
      where: { organizationId, mlItemId: params.mlItemId },
      select: { mlItemId: true },
    }),
    prisma.listing.findFirst({
      where: { organizationId, mlItemId: params.mlItemId },
      select: { mlItemId: true },
    }),
  ]);
  if (!health && !listing) throw new RotinaSimulationNotFoundError();
  return loadListingAds(params.token, params.mlItemId, params.basis);
}

/** O contexto com o ADS de outra base: só os campos de ADS mudam. */
export function contextWithAds(ctx: SimulationContext, ads: TacosAds): SimulationContext {
  return {
    ...ctx,
    inputs: inputsWithAds(ctx.inputs, ads),
    listing: {
      ...ctx.listing,
      adsAvailable: ads.available,
      tacosPercent: ads.tacosPercent,
      adsCost: ads.adsCost,
    },
  };
}

/** O mínimo com o contexto já montado (retrato da Central ou leitura da Calculadora). */
export async function floorWithContext(
  ctx: SimulationContext,
  params: {
    token: string;
    userId: number;
    /** Omitido = o tipo de hoje. */
    listingTypeId?: SimulatableListingType;
    /** Omitida = a meta do contexto. */
    targetPercent?: number;
  },
): Promise<RotinaTypeFloor> {
  const { token, userId } = params;
  const currentListingTypeId = ctx.item.listing_type_id ?? null;
  const listingTypeId = params.listingTypeId ?? currentListingTypeId;
  const targetPercent = params.targetPercent ?? ctx.targetPercent;
  const base = { mlItemId: ctx.mlItemId, listingTypeId, targetPercent };
  if (ctx.blocked) return { ...base, blocked: ctx.blocked, floor: null };

  const { salePrice } = ctx.listing;
  if (salePrice <= 0) return { ...base, blocked: null, floor: null };

  const inputs = inputsForListingType(ctx.inputs, currentListingTypeId, listingTypeId);
  const item =
    params.listingTypeId && params.listingTypeId !== currentListingTypeId
      ? itemAsListingType(ctx.item, params.listingTypeId)
      : ctx.item;
  const seed = await resolveMlCostsAtPrice(
    token,
    userId,
    item,
    salePrice,
    item.currency_id ?? null,
  ).catch(() => null);
  if (!seed) return { ...base, blocked: null, floor: null };

  const today = simulateMarginAtPrice(salePrice, seed, inputs, targetPercent);
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
    targetPercent,
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
    targetPercent,
  );
  return { ...base, blocked: null, floor };
}
