import { prisma } from "@/lib/db/db";
import { loadFinancialEvaluationRowsForItems } from "@/lib/lucratividade/financial-evaluation-data";
import { marginExclusionReason } from "@/lib/lucratividade/margin-summary";
import { fetchItemsByIdsBatched } from "@/lib/mercadolibre/api";
import { roundMoney } from "@/lib/pricing/financial-margin";
import { resolveMlCostsAtPrice } from "@/lib/pricing/refine-min-sale-price";
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
 */

export class RotinaSimulationNotFoundError extends Error {
  constructor() {
    super("rotina_listing_not_found");
  }
}

export type RotinaSimulation = {
  mlItemId: string;
  targetPercent: number;
  /** De onde vieram custo/imposto/ADS. */
  inputsFrom: "refresh" | "live";
  /** Quando esses insumos foram lidos (rodada). */
  inputsAt: string | null;
  /** Rebate de tarifa aplicado em todo preço (só anúncio com promoção). */
  feeRebate: number | null;
  /** Sem custo/alíquota/kit completo a conta não vale: nada é simulado. */
  blocked: "missing_cost" | "missing_tax" | "kit_incomplete" | "incomplete" | null;
  results: SimulatedPrice[];
};

export async function simulateListingPrices(
  organizationId: string,
  params: { token: string; userId: number; mlItemId: string; prices: number[] },
): Promise<RotinaSimulation> {
  const { token, userId, mlItemId } = params;
  const prices = [...new Set(params.prices.map((price) => roundMoney(price)))].filter(
    (price) => price > 0,
  );

  const [health, listing, settings, targets, items] = await Promise.all([
    prisma.listingHealth.findFirst({
      where: { organizationId, mlItemId },
      select: {
        catalogListing: true,
        exclusionReason: true,
        pricingInputs: true,
        computedAt: true,
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

  let inputs: RotinaPricingInputs | null = health ? parsePricingInputs(health.pricingInputs) : null;
  let blocked: RotinaSimulation["blocked"] =
    (health?.exclusionReason as RotinaSimulation["blocked"]) ?? null;
  let inputsFrom: RotinaSimulation["inputsFrom"] = "refresh";

  if (!inputs) {
    const [row] = await loadFinancialEvaluationRowsForItems(token, userId, organizationId, [
      item,
    ]);
    if (!row) throw new RotinaSimulationNotFoundError();
    inputs = pricingInputsFromRow(row);
    blocked = marginExclusionReason(row);
    inputsFrom = "live";
  }

  const base = {
    mlItemId,
    targetPercent,
    inputsFrom,
    inputsAt: inputsFrom === "refresh" ? (health?.computedAt.toISOString() ?? null) : null,
    feeRebate: inputs.mlFeeRebate && inputs.mlFeeRebate > 0 ? inputs.mlFeeRebate : null,
  };
  if (blocked) return { ...base, blocked, results: [] };

  const pricing = inputs;
  const results = await Promise.all(
    prices.map(async (price) => {
      const costs = await resolveMlCostsAtPrice(
        token,
        userId,
        item,
        price,
        item.currency_id ?? null,
      ).catch(() => null);
      return simulateMarginAtPrice(price, costs, pricing, targetPercent);
    }),
  );

  return { ...base, blocked: null, results };
}
