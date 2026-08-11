import { prisma } from "@/lib/db";
import { decimalToNumber } from "@/lib/catalog-competition";
import { normalizeProductSku } from "@/lib/product-pricing";
import {
  computeLevelingPricingCost,
  dateRangeOverlapsMonth,
  dateRangesOverlap,
  DreProductCostLevelingError,
  isValidDatePeriod,
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

function toView(row: {
  id: string;
  sku: string;
  startDate: Date;
  endDate: Date;
  hasIcmsSt: boolean;
  unitCostNf: unknown;
  purchaseCostWithSt: unknown;
  ipiPercent: unknown;
  createdAt: Date;
  updatedAt: Date;
}): DreProductCostLevelingView {
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
    startDate: toYmd(row.startDate),
    endDate: toYmd(row.endDate),
    hasIcmsSt: row.hasIcmsSt,
    unitCostNf,
    purchaseCostWithSt,
    ipiPercent,
    pricingCost,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function assertNoOverlap(
  sku: string,
  period: { startDate: string; endDate: string },
  excludeId?: string,
) {
  const existing = await prisma.dreProductCostLeveling.findMany({
    where: {
      sku,
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

export async function listDreProductCostLevelings(): Promise<
  DreProductCostLevelingView[]
> {
  const rows = await prisma.dreProductCostLeveling.findMany({
    orderBy: [{ sku: "asc" }, { startDate: "asc" }],
  });
  return rows.map(toView);
}

export async function createDreProductCostLeveling(
  raw: DreProductCostLevelingInput,
): Promise<DreProductCostLevelingView> {
  const sku = normalizeProductSku(raw.sku);
  const input: DreProductCostLevelingInput = { ...raw, sku };
  assertCostInput(input);

  const product = await prisma.product.findUnique({
    where: { sku },
    select: { sku: true },
  });
  if (!product) {
    throw new DreProductCostLevelingError(
      `SKU ${sku} não encontrado em Meus produtos.`,
      "sku_not_found",
    );
  }

  await assertNoOverlap(sku, input);

  const row = await prisma.dreProductCostLeveling.create({
    data: {
      sku,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      hasIcmsSt: input.hasIcmsSt,
      unitCostNf: input.unitCostNf,
      purchaseCostWithSt: input.hasIcmsSt ? input.purchaseCostWithSt : null,
      ipiPercent: input.ipiPercent,
    },
  });
  return toView(row);
}

export async function updateDreProductCostLeveling(
  id: string,
  raw: DreProductCostLevelingInput,
): Promise<DreProductCostLevelingView> {
  const existing = await prisma.dreProductCostLeveling.findUnique({
    where: { id },
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

  const product = await prisma.product.findUnique({
    where: { sku },
    select: { sku: true },
  });
  if (!product) {
    throw new DreProductCostLevelingError(
      `SKU ${sku} não encontrado em Meus produtos.`,
      "sku_not_found",
    );
  }

  await assertNoOverlap(sku, input, id);

  const row = await prisma.dreProductCostLeveling.update({
    where: { id },
    data: {
      sku,
      startDate: new Date(`${input.startDate}T00:00:00.000Z`),
      endDate: new Date(`${input.endDate}T00:00:00.000Z`),
      hasIcmsSt: input.hasIcmsSt,
      unitCostNf: input.unitCostNf,
      purchaseCostWithSt: input.hasIcmsSt ? input.purchaseCostWithSt : null,
      ipiPercent: input.ipiPercent,
    },
  });
  return toView(row);
}

export async function deleteDreProductCostLeveling(id: string): Promise<void> {
  try {
    await prisma.dreProductCostLeveling.delete({ where: { id } });
  } catch {
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
  year: number,
  month: number,
): Promise<DreProductCostLevelingPricing[]> {
  if (!Number.isInteger(month) || month < 1 || month > 12) return [];

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const rows = await prisma.dreProductCostLeveling.findMany({
    where: {
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
  });

  return rows
    .map(toView)
    .filter((view) =>
      dateRangeOverlapsMonth(view.startDate, view.endDate, year, month),
    )
    .map((view) => ({
      sku: normalizeProductSku(view.sku),
      startDate: view.startDate,
      endDate: view.endDate,
      pricingCost: view.pricingCost,
    }));
}
