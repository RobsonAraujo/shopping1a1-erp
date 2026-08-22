import { prisma } from "@/lib/db";
import {
  buildExcludedMonthsSet,
  buildExplicitFixedCostMap,
  resolveEffectiveFixedCostForMonth,
} from "@/lib/tax-report/fixed-cost-credit";

export type TaxFixedCostItemView = {
  id: string;
  name: string;
  sortOrder: number;
  /** true = repete todo mês até ser alterado/removido; false = só vale nos meses com valor explícito. */
  recurring: boolean;
  /** Se setado, o item não se aplica a partir de (endYear, endMonth) inclusive. */
  endYear: number | null;
  endMonth: number | null;
};

export type TaxFixedCostItemStatus = "normal" | "excluded_this_month" | "ended";

export type TaxFixedCostItemWithMonthValue = TaxFixedCostItemView & {
  /** Valor efetivo pro mês pedido: explícito, herdado (se recorrente) ou null. */
  amount: number | null;
  /** true quando o valor foi cadastrado explicitamente para esse mês (não herdado). */
  isExplicit: boolean;
  status: TaxFixedCostItemStatus;
};

const ITEM_SELECT = {
  id: true,
  name: true,
  sortOrder: true,
  recurring: true,
  endYear: true,
  endMonth: true,
} as const;

function statusFor(
  item: TaxFixedCostItemView,
  year: number,
  month: number,
  excludedMonths: Set<string>,
): TaxFixedCostItemStatus {
  if (
    item.endYear != null &&
    item.endMonth != null &&
    (year > item.endYear ||
      (year === item.endYear && month >= item.endMonth))
  ) {
    return "ended";
  }
  if (excludedMonths.has(`${year}:${month}:${item.id}`)) {
    return "excluded_this_month";
  }
  return "normal";
}

export async function loadTaxFixedCostItemsWithMonthValue(
  organizationId: string,
  year: number,
  month: number,
): Promise<TaxFixedCostItemWithMonthValue[]> {
  const [items, explicitValues, excludedMonths] = await Promise.all([
    loadTaxFixedCostItems(organizationId),
    loadTaxFixedCostExplicitValues(organizationId, year),
    loadTaxFixedCostExcludedMonths(organizationId, year),
  ]);

  return items.map((item) => {
    const amount = resolveEffectiveFixedCostForMonth(
      item.id,
      year,
      month,
      explicitValues,
      item.recurring,
      excludedMonths,
      item.endYear,
      item.endMonth,
    );
    const isExplicit = explicitValues.has(`${year}:${month}:${item.id}`);
    return {
      ...item,
      amount,
      isExplicit,
      status: statusFor(item, year, month, excludedMonths),
    };
  });
}

export async function loadTaxFixedCostItems(
  organizationId: string,
): Promise<TaxFixedCostItemView[]> {
  const items = await prisma.taxFixedCostItem.findMany({
    where: { organizationId, active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: ITEM_SELECT,
  });
  return items;
}

/** Valores explícitos cadastrados no ano pedido e no anterior (pra permitir herança na virada de ano). */
export async function loadTaxFixedCostExplicitValues(
  organizationId: string,
  year: number,
): Promise<Map<string, number>> {
  const rows = await prisma.taxFixedCostMonthValue.findMany({
    where: { organizationId, year: { in: [year - 1, year] } },
    select: { costItemId: true, year: true, month: true, amount: true },
  });
  return buildExplicitFixedCostMap(rows);
}

/** Meses explicitamente excluídos ("Remover valor deste mês") no ano pedido e no anterior. */
export async function loadTaxFixedCostExcludedMonths(
  organizationId: string,
  year: number,
): Promise<Set<string>> {
  const rows = await prisma.taxFixedCostMonthExclusion.findMany({
    where: { organizationId, year: { in: [year - 1, year] } },
    select: { costItemId: true, year: true, month: true },
  });
  return buildExcludedMonthsSet(rows);
}

export async function createTaxFixedCostItem(
  organizationId: string,
  name: string,
  recurring: boolean,
  initialAmount?: {
    year: number;
    month: number;
    amount: number;
  } | null,
): Promise<TaxFixedCostItemView> {
  const maxSort = await prisma.taxFixedCostItem.aggregate({
    where: { organizationId, active: true },
    _max: { sortOrder: true },
  });
  const item = await prisma.taxFixedCostItem.create({
    data: {
      organizationId,
      name,
      recurring,
      sortOrder: (maxSort._max.sortOrder ?? 0) + 1,
    },
    select: ITEM_SELECT,
  });

  if (initialAmount) {
    await prisma.taxFixedCostMonthValue.create({
      data: {
        organizationId,
        costItemId: item.id,
        year: initialAmount.year,
        month: initialAmount.month,
        amount: initialAmount.amount,
      },
    });
  }

  return item;
}

export async function updateTaxFixedCostItem(
  organizationId: string,
  id: string,
  input: { name?: string; recurring?: boolean },
): Promise<TaxFixedCostItemView> {
  return prisma.taxFixedCostItem.update({
    where: { id, organizationId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.recurring !== undefined ? { recurring: input.recurring } : {}),
    },
    select: ITEM_SELECT,
  });
}

/** "Encerrar gasto fixo": o item deixa de se aplicar a partir de (year, month) inclusive. Meses anteriores não são afetados. */
export async function endTaxFixedCostItem(
  organizationId: string,
  id: string,
  year: number,
  month: number,
): Promise<TaxFixedCostItemView> {
  return prisma.taxFixedCostItem.update({
    where: { id, organizationId },
    data: { endYear: year, endMonth: month },
    select: ITEM_SELECT,
  });
}

export async function deactivateTaxFixedCostItem(
  organizationId: string,
  id: string,
): Promise<void> {
  await prisma.taxFixedCostItem.update({
    where: { id, organizationId },
    data: { active: false },
  });
}

export async function upsertTaxFixedCostMonthValue(
  organizationId: string,
  input: {
    costItemId: string;
    year: number;
    month: number;
    amount: number | null;
  },
): Promise<void> {
  if (input.amount === null) {
    await prisma.taxFixedCostMonthValue.deleteMany({
      where: {
        organizationId,
        costItemId: input.costItemId,
        year: input.year,
        month: input.month,
      },
    });
    return;
  }

  await prisma.taxFixedCostMonthValue.upsert({
    where: {
      costItemId_year_month: {
        costItemId: input.costItemId,
        year: input.year,
        month: input.month,
      },
    },
    create: {
      organizationId,
      costItemId: input.costItemId,
      year: input.year,
      month: input.month,
      amount: input.amount,
    },
    update: { amount: input.amount },
  });
}

/** "Remover valor deste mês": exclui só esse mês do item, sem afetar a herança dos meses seguintes. */
export async function excludeTaxFixedCostMonth(
  organizationId: string,
  costItemId: string,
  year: number,
  month: number,
): Promise<void> {
  await prisma.$transaction([
    prisma.taxFixedCostMonthValue.deleteMany({
      where: { organizationId, costItemId, year, month },
    }),
    prisma.taxFixedCostMonthExclusion.upsert({
      where: { costItemId_year_month: { costItemId, year, month } },
      create: { organizationId, costItemId, year, month },
      update: {},
    }),
  ]);
}
