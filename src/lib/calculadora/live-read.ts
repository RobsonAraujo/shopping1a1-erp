import { prisma } from "@/lib/db/db";
import { loadListingGroups } from "@/lib/products/listing-groups";
import {
  decimalToNumber,
  deriveStatusFromPriceToWin,
  extractPriceToWin,
} from "@/lib/catalog-report/catalog-competition";
import {
  nfBasisFromProduct,
  type CalculatorPurchaseBasis,
} from "@/lib/calculadora/purchase-cost";
import type {
  CalculatorAds,
  CalculatorCatalog,
  CalculatorReading,
} from "@/lib/calculadora/reading";
import type {
  CalculatorFloorBody,
  CalculatorSimulateBody,
} from "@/lib/calculadora/request-schema";
import { logServerError } from "@/lib/infra/server-public-error";
import {
  loadAdsMetricsByItem,
  loadFinancialEvaluationRowsForItems,
  type FinancialEvaluationMeta,
  type FinancialEvaluationRow,
} from "@/lib/lucratividade/financial-evaluation-data";
import { fetchItemPriceToWin, fetchItemsByIdsBatched } from "@/lib/mercadolibre/api";
import { siteIdFromItemId } from "@/lib/mercadolibre/listing-fees";
import { getProductAdsDateRange } from "@/lib/mercadolibre/product-ads-metrics";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import { adsFromLoad } from "@/lib/pricing/tacos-basis";
import { loadListingAds } from "@/lib/pricing/tacos-basis-data";
import { pricingInputsFromRow } from "@/lib/rotina/health-row";
import { loadListingTargets } from "@/lib/rotina/listing-targets";
import { loadRotinaSettings } from "@/lib/rotina/rotina-settings";
import { effectiveMinMarginPercent } from "@/lib/rotina/rules";
import {
  floorWithContext,
  simulateWithContext,
  type RotinaSimulation,
  type RotinaTypeFloor,
  type SimulationBlock,
  type SimulationContext,
} from "@/lib/rotina/simulate";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

/**
 * Leitura ao vivo da Calculadora, independente da Central: nenhum número sai
 * do retrato do Atualizar (`ListingHealth` só confirma que o anúncio é da
 * loja). Do banco vêm o cadastro (custo, PMA), o imposto do Tributário e as
 * metas — configuração, não retrato.
 *
 * Custo no ML por anúncio aberto: item + preço com promoção + taxa + frete
 * (+ rebate) + Product Ads de hoje, e `price_to_win` no catálogo. Cada preço
 * simulado depois: item + taxa + frete. O ADS de 7 dias só sob demanda.
 */

export class CalculatorListingNotFoundError extends Error {
  constructor() {
    super("calculator_listing_not_found");
  }
}

/** O anúncio não está ativo nem pausado no ML: não há preço de hoje. */
export class CalculatorListingInactiveError extends Error {
  constructor() {
    super("calculator_listing_inactive");
  }
}

/**
 * Só anúncios da própria loja (os da lista da Calculadora: `Listing` ou já
 * lidos pela Central): a rota não é um cotador genérico.
 */
async function assertOwnListing(organizationId: string, mlItemId: string): Promise<void> {
  const [listing, seen] = await Promise.all([
    prisma.listing.findFirst({ where: { organizationId, mlItemId }, select: { mlItemId: true } }),
    prisma.listingHealth.findFirst({
      where: { organizationId, mlItemId },
      select: { mlItemId: true },
    }),
  ]);
  if (!listing && !seen) throw new CalculatorListingNotFoundError();
}

/** Por que a conta não vale. "Taxa não cotada no preço de hoje" não bloqueia: outro preço pode cotar. */
export function blockedFromRow(
  row: Pick<FinancialEvaluationRow, "kitMissingSkus" | "productCost" | "taxRatePercent">,
): SimulationBlock {
  if (row.kitMissingSkus && row.kitMissingSkus.length > 0) return "kit_incomplete";
  if (row.productCost === null) return "missing_cost";
  if (row.taxRatePercent === null) return "missing_tax";
  return null;
}

function blockedFromInputs(inputs: RotinaPricingInputs): SimulationBlock {
  if (inputs.productCost === null) return "missing_cost";
  if (inputs.taxRatePercent === null) return "missing_tax";
  return null;
}

async function readCatalog(token: string, mlItemId: string): Promise<CalculatorCatalog | null> {
  try {
    const payload = (await fetchItemPriceToWin(token, mlItemId)) as Record<string, unknown>;
    return {
      status: deriveStatusFromPriceToWin(payload),
      priceToWin: extractPriceToWin(payload),
    };
  } catch (e) {
    // Sem status de catálogo a conta segue valendo; só some a pílula e o atalho.
    logServerError(`calculadora price_to_win item=${mlItemId}`, e);
    return null;
  }
}

/**
 * Como o orçamento (preço unitário na NF) vira o custo da conta: o IPI e a ST
 * do produto do cadastro, e as unidades num kit de um produto só. Mesma
 * precedência do custo da leitura (`pricingFor`: o vínculo por `mlItemId`,
 * depois o SKU), e só vale se refizer o custo que a leitura usou.
 */
async function loadPurchaseBasis(
  organizationId: string,
  mlItemId: string,
  row: Pick<FinancialEvaluationRow, "productCost" | "sku" | "isKitComposition" | "kitComponents">,
): Promise<CalculatorPurchaseBasis> {
  const unknown: CalculatorPurchaseBasis = { kind: "effective", reason: "unknown" };
  if (row.productCost === null) return unknown;
  const components = row.isKitComposition ? (row.kitComponents ?? []) : null;
  if (components && components.length !== 1) return { kind: "effective", reason: "kit" };
  const component = components?.[0] ?? null;
  const sku = component ? component.sku : row.sku;
  const units = component ? component.quantity : 1;
  const normalizedSku = sku ? normalizeProductSku(sku) : null;
  // Opção de venda: o cadastro é o do anúncio principal (mesma regra da leitura).
  const principal = component
    ? mlItemId
    : (await loadListingGroups(organizationId)).principalOf(mlItemId);
  const ownIds = component ? [] : [...new Set([principal, mlItemId])];
  const or = [
    ...ownIds.map((id) => ({ mlItemId: id })),
    ...(normalizedSku ? [{ sku: normalizedSku }] : []),
  ];
  if (or.length === 0) return unknown;

  const products = await prisma.product.findMany({
    where: { organizationId, needsCostReview: false, OR: or },
    select: {
      mlItemId: true,
      unitCostNf: true,
      purchaseIcmsPercent: true,
      hasIcmsSt: true,
      purchaseCostWithSt: true,
      ipiPercent: true,
    },
  });
  const rank = (id: string) => (component ? 2 : id === principal ? 0 : id === mlItemId ? 1 : 2);
  const ordered = [...products].sort((a, b) => rank(a.mlItemId) - rank(b.mlItemId));
  for (const product of ordered) {
    const basis = nfBasisFromProduct(
      {
        unitCostNf: decimalToNumber(product.unitCostNf) ?? 0,
        purchaseIcmsPercent: decimalToNumber(product.purchaseIcmsPercent) ?? 0,
        hasIcmsSt: product.hasIcmsSt,
        purchaseCostWithSt: decimalToNumber(product.purchaseCostWithSt),
        ipiPercent: decimalToNumber(product.ipiPercent) ?? 0,
      },
      units,
      row.productCost,
    );
    if (basis) return basis;
  }
  return unknown;
}

/** Abre um anúncio: o preço, a margem e os insumos de agora, com o TACOS de hoje. */
export async function readCalculatorListingNow(
  organizationId: string,
  params: { token: string; userId: number; mlItemId: string },
): Promise<CalculatorReading> {
  const { token, userId, mlItemId } = params;
  await assertOwnListing(organizationId, mlItemId);

  const todayRange = getProductAdsDateRange(1);
  const [items, adsLoad, settings, targets] = await Promise.all([
    fetchItemsByIdsBatched(token, [mlItemId]),
    loadAdsMetricsByItem(token, siteIdFromItemId(mlItemId), [mlItemId], todayRange),
    loadRotinaSettings(organizationId),
    loadListingTargets(organizationId),
  ]);
  const item = items[0];
  if (!item) throw new CalculatorListingNotFoundError();
  const catalogListing = item.catalog_listing === true;

  // Objeto, não `let`: o TS não enxerga a atribuição feita dentro do callback.
  const captured: { meta?: FinancialEvaluationMeta } = {};
  const [rows, catalog] = await Promise.all([
    loadFinancialEvaluationRowsForItems(token, userId, organizationId, [item], {
      adsLoad,
      onMeta: (meta) => {
        captured.meta = meta;
      },
    }),
    catalogListing ? readCatalog(token, mlItemId) : Promise.resolve(null),
  ]);
  const row = rows[0];
  if (!row) throw new CalculatorListingInactiveError();

  const purchaseBasis = await loadPurchaseBasis(organizationId, mlItemId, row);
  const target = targets.get(mlItemId) ?? null;
  return {
    mlItemId,
    readAt: new Date().toISOString(),
    listingTypeId: row.listingTypeId,
    price: row.salePrice,
    regularPrice: row.regularPrice,
    hasPromotion: row.hasPromotion,
    promotionKnown: row.promotionKnown !== false,
    pmaPrice: row.pmaPrice,
    costsNow:
      row.mlFeeAmount !== null && row.shippingCost !== null
        ? { mlFeeAmount: row.mlFeeAmount, shippingCost: row.shippingCost }
        : null,
    inputs: pricingInputsFromRow(row),
    taxSource: captured.meta?.taxSource ?? null,
    blocked: blockedFromRow(row),
    catalog,
    targetPercent: effectiveMinMarginPercent(catalogListing, settings, target),
    ownTarget: target?.minMarginPercent !== null && target?.minMarginPercent !== undefined,
    ads: adsFromLoad(adsLoad, mlItemId, "today", todayRange),
    purchaseBasis,
  };
}

/** O TACOS de 7 dias (a mesma janela da Lucratividade e da Central), sob demanda. */
export async function readCalculatorAds7d(
  organizationId: string,
  params: { token: string; mlItemId: string },
): Promise<CalculatorAds> {
  await assertOwnListing(organizationId, params.mlItemId);
  return loadListingAds(params.token, params.mlItemId, "7d");
}

/** O contexto da conta a partir da leitura que o navegador devolve, com o item de novo. */
async function contextFromBody(
  organizationId: string,
  token: string,
  body: CalculatorSimulateBody | CalculatorFloorBody,
): Promise<SimulationContext> {
  await assertOwnListing(organizationId, body.mlItemId);
  const [item] = await fetchItemsByIdsBatched(token, [body.mlItemId]);
  if (!item) throw new CalculatorListingNotFoundError();
  const inputs: RotinaPricingInputs = body.inputs;
  return {
    mlItemId: body.mlItemId,
    item,
    targetPercent: body.targetPercent,
    inputs,
    inputsFrom: "live",
    inputsAt: body.readAt,
    blocked: body.blocked ?? blockedFromInputs(inputs),
    listing: {
      salePrice: body.salePrice,
      regularPrice: body.regularPrice,
      pmaPrice: body.pmaPrice,
      adsAvailable: inputs.adsMetricsAvailable,
      tacosPercent: inputs.tacosPercent,
      adsCost: inputs.adsCost,
    },
  };
}

export async function simulateCalculatorPrices(
  organizationId: string,
  params: { token: string; userId: number; body: CalculatorSimulateBody },
): Promise<RotinaSimulation> {
  const { token, userId, body } = params;
  const ctx = await contextFromBody(organizationId, token, body);
  return simulateWithContext(ctx, {
    token,
    userId,
    prices: body.prices,
    listingTypeId: body.listingTypeId,
  });
}

export async function computeCalculatorFloor(
  organizationId: string,
  params: { token: string; userId: number; body: CalculatorFloorBody },
): Promise<RotinaTypeFloor> {
  const { token, userId, body } = params;
  const ctx = await contextFromBody(organizationId, token, body);
  return floorWithContext(ctx, {
    token,
    userId,
    listingTypeId: body.listingTypeId,
    targetPercent: body.targetPercent,
  });
}
