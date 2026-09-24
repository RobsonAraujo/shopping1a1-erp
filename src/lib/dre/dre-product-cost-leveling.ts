import { prisma } from "@/lib/db/db";
import { decimalToNumber } from "@/lib/catalog-report/catalog-competition";
import { normalizeProductSku } from "@/lib/pricing/product-pricing";
import {
  computeLevelingPricingCost,
  dateRangeOverlapsMonth,
  dateRangesOverlap,
  DreProductCostLevelingError,
  isValidDatePeriod,
  levelingScope,
  type DreProductCostLevelingInput,
  type DreProductCostLevelingPricing,
  type DreProductCostLevelingView,
} from "@/lib/dre/dre-product-cost-leveling-shared";

export {
  applyLevelingPricingToMap,
  applyLevelingsForOrderDate,
  computeLevelingPricingCost,
  dateRangeOverlapsMonth,
  dateRangesOverlap,
  DreProductCostLevelingError,
  enumerateMonthsOverlappingDateRange,
  isValidDatePeriod,
  isValidYmd,
  levelingScope,
  resolveLevelingCostForOrderDate,
  type DreProductCostLevelingInput,
  type DreProductCostLevelingPricing,
  type DreProductCostLevelingView,
} from "@/lib/dre/dre-product-cost-leveling-shared";

function assertCostInput(input: DreProductCostLevelingInput): number {
  if (!isValidDatePeriod(input.startDate, input.endDate)) {
    throw new DreProductCostLevelingError(
      "Período inválido (data início deve ser ≤ data fim).",
      "invalid_period",
    );
  }

  const pricingCost = computeLevelingPricingCost(input);
  if (pricingCost === null) {
    throw new DreProductCostLevelingError(
      input.hasIcmsSt
        ? "Informe o custo de compra somado ICMS-ST e um IPI válido."
        : "Informe o custo unitário NF e um IPI válido.",
      "invalid_cost",
    );
  }
  if (
    !Number.isFinite(input.ipiPercent) ||
    input.ipiPercent < 0 ||
    input.ipiPercent > 100
  ) {
    throw new DreProductCostLevelingError(
      "IPI deve estar entre 0 e 100%.",
      "invalid_cost",
    );
  }
  return pricingCost;
}

function toYmd(value: Date | string): string {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }
  const y = value.getUTCFullYear();
  const m = String(value.getUTCMonth() + 1).padStart(2, "0");
  const d = String(value.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function toView(
  row: {
  id: string;
  sku: string;
  productMlItemId: string | null;
  startDate: Date;
  endDate: Date;
  hasIcmsSt: boolean;
  unitCostNf: unknown;
  purchaseCostWithSt: unknown;
  ipiPercent: unknown;
  purchaseIcmsPercent: unknown;
  extraCosts: unknown;
  isMonophasic: boolean | null;
  saleIcmsPercent: unknown;
  isImported: boolean | null;
  pmaPrice: unknown;
  createdAt: Date;
  updatedAt: Date;
  },
  currentSku: string | null = null,
): DreProductCostLevelingView {
  const unitCostNf = decimalToNumber(row.unitCostNf) ?? 0;
  const purchaseCostWithSt = decimalToNumber(row.purchaseCostWithSt);
  const ipiPercent = decimalToNumber(row.ipiPercent) ?? 0;
  const pricingCost =
    computeLevelingPricingCost({
      hasIcmsSt: row.hasIcmsSt,
      unitCostNf,
      purchaseCostWithSt,
      ipiPercent,
    }) ?? 0;

  return {
    id: row.id,
    sku: row.sku,
    productMlItemId: row.productMlItemId,
    currentSku,
    startDate: toYmd(row.startDate),
    endDate: toYmd(row.endDate),
    hasIcmsSt: row.hasIcmsSt,
    unitCostNf,
    purchaseCostWithSt,
    ipiPercent,
    purchaseIcmsPercent: decimalToNumber(row.purchaseIcmsPercent),
    extraCosts: decimalToNumber(row.extraCosts),
    isMonophasic: row.isMonophasic,
    saleIcmsPercent: decimalToNumber(row.saleIcmsPercent),
    isImported: row.isImported,
    pmaPrice: decimalToNumber(row.pmaPrice),
    pricingCost,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveLevelingProduct(
  organizationId: string,
  input: { productMlItemId?: string | null; sku: string },
): Promise<{ mlItemId: string }> {
  if (input.productMlItemId) {
    const byIdentity = await prisma.product.findFirst({
      where: { organizationId, mlItemId: input.productMlItemId },
      select: { mlItemId: true },
    });
    if (byIdentity) return byIdentity;
    throw new DreProductCostLevelingError(
      `Anúncio ${input.productMlItemId} não encontrado em Meus produtos.`,
      "sku_not_found",
    );
  }

  const byText = await prisma.product.findFirst({
    where: { organizationId, sku: input.sku },
    select: { mlItemId: true },
  });
  if (!byText) {
    throw new DreProductCostLevelingError(
      `SKU ${input.sku} não encontrado em Meus produtos.`,
      "sku_not_found",
    );
  }
  return byText;
}

/** `Product.sku` atual de cada identidade, para preencher `currentSku`. */
async function loadCurrentSkusByMlItemId(
  organizationId: string,
  mlItemIds: string[],
): Promise<Map<string, string | null>> {
  const unique = [...new Set(mlItemIds.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const products = await prisma.product.findMany({
    where: { organizationId, mlItemId: { in: unique } },
    select: { mlItemId: true, sku: true },
  });
  return new Map(products.map((p) => [p.mlItemId, p.sku]));
}

async function assertNoOverlap(
  organizationId: string,
  sku: string,
  productMlItemId: string,
  period: { startDate: string; endDate: string },
  excludeId?: string,
) {
  const existing = await prisma.dreProductCostLeveling.findMany({
    where: {
      organizationId,
      ...levelingScope(productMlItemId, sku),
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: {
      id: true,
      startDate: true,
      endDate: true,
    },
  });

  for (const row of existing) {
    const other = {
      startDate: toYmd(row.startDate),
      endDate: toYmd(row.endDate),
    };
    if (dateRangesOverlap(period, other)) {
      throw new DreProductCostLevelingError(
        `Já existe nivelamento para o SKU ${sku} que se sobrepõe a este período.`,
        "overlap",
      );
    }
  }
}

/**
 * Nivelamentos de um produto — filtrado por identidade (`mlItemId`) quando
 * disponível, ou pelo texto de SKU (compatibilidade). Sem filtro, devolve
 * todos os da organização.
 */
export async function listDreProductCostLevelings(
  organizationId: string,
  filter?: { mlItemId?: string; sku?: string },
): Promise<DreProductCostLevelingView[]> {
  let scope: Record<string, unknown> = {};
  if (filter?.mlItemId) {
    const product = await prisma.product.findFirst({
      where: { organizationId, mlItemId: filter.mlItemId },
      select: { mlItemId: true, sku: true },
    });
    // O texto do produto cobre as linhas legadas sem `productMlItemId`.
    scope = levelingScope(
      filter.mlItemId,
      product?.sku ? normalizeProductSku(product.sku) : null,
    );
  } else if (filter?.sku) {
    const key = normalizeProductSku(filter.sku);
    const product = await prisma.product.findFirst({
      where: { organizationId, sku: key },
      select: { mlItemId: true },
    });
    scope = product ? levelingScope(product.mlItemId, key) : { sku: key };
  }

  const rows = await prisma.dreProductCostLeveling.findMany({
    where: {
      organizationId,
      ...scope,
    },
    orderBy: [{ sku: "asc" }, { startDate: "asc" }],
  });

  const currentSkus = await loadCurrentSkusByMlItemId(
    organizationId,
    rows.map((row) => row.productMlItemId).filter((id): id is string => Boolean(id)),
  );
  return rows.map((row) =>
    toView(row, row.productMlItemId ? (currentSkus.get(row.productMlItemId) ?? null) : null),
  );
}

export async function createDreProductCostLeveling(
  organizationId: string,
  raw: DreProductCostLevelingInput,
): Promise<DreProductCostLevelingView> {
  const sku = normalizeProductSku(raw.sku);
  const input: DreProductCostLevelingInput = { ...raw, sku };
  assertCostInput(input);

  const product = await resolveLevelingProduct(organizationId, input);

  await assertNoOverlap(organizationId, sku, product.mlItemId, input);

  const row = await prisma.dreProductCostLeveling.create({
    data: {
      organizationId,
      sku,
      productMlItemId: product.mlItemId,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      hasIcmsSt: input.hasIcmsSt,
      unitCostNf: input.unitCostNf,
      purchaseCostWithSt: input.hasIcmsSt ? input.purchaseCostWithSt : null,
      ipiPercent: input.ipiPercent,
      purchaseIcmsPercent: input.purchaseIcmsPercent,
      extraCosts: input.extraCosts,
      isMonophasic: input.isMonophasic,
      saleIcmsPercent: input.saleIcmsPercent,
      isImported: input.isImported,
      pmaPrice: input.pmaPrice,
    },
  });
  return toView(row, sku);
}

export async function updateDreProductCostLeveling(
  organizationId: string,
  id: string,
  raw: DreProductCostLevelingInput,
): Promise<DreProductCostLevelingView> {
  const existing = await prisma.dreProductCostLeveling.findFirst({
    where: { id, organizationId },
    select: { id: true },
  });
  if (!existing) {
    throw new DreProductCostLevelingError(
      "Nivelamento não encontrado.",
      "not_found",
    );
  }

  const sku = normalizeProductSku(raw.sku);
  const input: DreProductCostLevelingInput = { ...raw, sku };
  assertCostInput(input);

  const product = await resolveLevelingProduct(organizationId, input);

  await assertNoOverlap(organizationId, sku, product.mlItemId, input, id);

  const row = await prisma.dreProductCostLeveling.update({
    where: { id },
    data: {
      sku,
      productMlItemId: product.mlItemId,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      hasIcmsSt: input.hasIcmsSt,
      unitCostNf: input.unitCostNf,
      purchaseCostWithSt: input.hasIcmsSt ? input.purchaseCostWithSt : null,
      ipiPercent: input.ipiPercent,
      purchaseIcmsPercent: input.purchaseIcmsPercent,
      extraCosts: input.extraCosts,
      isMonophasic: input.isMonophasic,
      saleIcmsPercent: input.saleIcmsPercent,
      isImported: input.isImported,
      pmaPrice: input.pmaPrice,
    },
  });
  return toView(row, sku);
}

export async function deleteDreProductCostLeveling(
  organizationId: string,
  id: string,
): Promise<void> {
  const result = await prisma.dreProductCostLeveling.deleteMany({
    where: { id, organizationId },
  });
  if (result.count === 0) {
    throw new DreProductCostLevelingError(
      "Nivelamento não encontrado.",
      "not_found",
    );
  }
}

/**
 * Nivelamentos cujo intervalo de datas intersecta o mês civil.
 */
export async function loadLevelingsOverlappingMonth(
  organizationId: string,
  year: number,
  month: number,
): Promise<DreProductCostLevelingPricing[]> {
  if (!Number.isInteger(month) || month < 1 || month > 12) return [];

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const rows = await prisma.dreProductCostLeveling.findMany({
    where: {
      organizationId,
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
  });

  return rows
    .map((row) => ({ productMlItemId: row.productMlItemId, view: toView(row) }))
    .filter(({ view }) =>
      dateRangeOverlapsMonth(view.startDate, view.endDate, year, month),
    )
    .map(({ productMlItemId, view }) => ({
      sku: normalizeProductSku(view.sku),
      productMlItemId,
      startDate: view.startDate,
      endDate: view.endDate,
      pricingCost: view.pricingCost,
    }));
}
