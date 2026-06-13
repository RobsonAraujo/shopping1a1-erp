import {
  computeDreTotals,
  sumYearLineAmounts,
  type DreComputedTotals,
  type DreLineAmounts,
  type DreMonthSnapshotPayload,
} from "@/lib/dre-calculations";
import { prisma } from "@/lib/db";
import {
  parseSnapshotPayload,
  snapshotPayloadToLines,
} from "@/lib/dre-month-data";
import {
  buildExplicitFixedCostMap,
  explicitFixedCostOverride,
  resolveEffectiveFixedCostsForYear,
} from "@/lib/dre-fixed-costs";
import {
  formatDreMonthLabel,
  isCurrentCalendarMonth,
  isDreMonthSyncable,
  isFutureCalendarMonth,
} from "@/lib/mercadolibre/revenue-periods";

export type DreCostItemView = {
  id: string;
  name: string;
  sortOrder: number;
};

export type DreMonthView = {
  month: number;
  label: string;
  isCurrentMonth: boolean;
  isFutureMonth: boolean;
  canSync: boolean;
  syncedAt: string | null;
  billingSource: DreMonthSnapshotPayload["billingSource"] | null;
  isPartial: boolean;
  incompleteProductCostCount: number;
  syncWarnings: string[];
  lines: DreLineAmounts | null;
  adsCost: number | null;
  /** Valor efetivo (explícito ou herdado do mês anterior). */
  fixedCostValues: Record<string, number | null>;
  /** Valor cadastrado só neste mês; null = herdado. */
  fixedCostOverrides: Record<string, number | null>;
  totals: DreComputedTotals | null;
};

export type DreYearView = {
  year: number;
  costItems: DreCostItemView[];
  months: DreMonthView[];
  yearTotals: DreComputedTotals | null;
};

function buildMonthTotals(
  payload: DreMonthSnapshotPayload | null,
  costItems: DreCostItemView[],
  fixedCostValues: Record<string, number | null>,
): DreComputedTotals | null {
  if (!payload) {
    const manualOnly = costItems
      .map((item) => ({
        costItemId: item.id,
        amount: fixedCostValues[item.id] ?? 0,
      }))
      .filter((row) => row.amount > 0);
    if (manualOnly.length === 0) return null;
    return computeDreTotals(
      {
        revenueMl: 0,
        cancelledSalesMl: 0,
        saleFeeMl: 0,
        partialReturnsMl: 0,
        productCostErp: 0,
        taxErp: 0,
        sellerShippingMl: 0,
      },
      0,
      manualOnly,
    );
  }

  const fixed = costItems.map((item) => ({
    costItemId: item.id,
    amount: fixedCostValues[item.id] ?? 0,
  }));

  return computeDreTotals(
    snapshotPayloadToLines(payload),
    payload.adsCost,
    fixed,
  );
}

export async function loadDreYearView(year: number): Promise<DreYearView> {
  const [costItems, snapshots, monthValues] = await Promise.all([
    prisma.dreCostItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true },
    }),
    prisma.dreMonthSnapshot.findMany({
      where: { year },
    }),
    prisma.dreCostMonthValue.findMany({
      where: { year: { in: [year, year - 1] } },
      select: { costItemId: true, year: true, month: true, amount: true },
    }),
  ]);

  const snapshotByMonth = new Map(
    snapshots.map((row) => [row.month, row]),
  );

  const explicitMap = buildExplicitFixedCostMap(monthValues);
  const costItemIds = costItems.map((item) => item.id);
  const effectiveByMonth = resolveEffectiveFixedCostsForYear(
    costItemIds,
    year,
    explicitMap,
  );

  const monthPayloads: DreMonthSnapshotPayload[] = [];
  const months: DreMonthView[] = [];

  for (let month = 1; month <= 12; month += 1) {
    const snapshot = snapshotByMonth.get(month);
    const payload = snapshot
      ? parseSnapshotPayload(snapshot.payload)
      : null;

    const fixedCostOverrides: Record<string, number | null> = {};
    const fixedCostValues: Record<string, number | null> = {};
    for (const item of costItems) {
      fixedCostOverrides[item.id] = explicitFixedCostOverride(
        explicitMap,
        year,
        month,
        item.id,
      );
      fixedCostValues[item.id] =
        effectiveByMonth[month]?.[item.id] ?? null;
    }

    const totals = buildMonthTotals(payload, costItems, fixedCostValues);

    if (payload) {
      monthPayloads.push(payload);
    }

    months.push({
      month,
      label: formatDreMonthLabel(month),
      isCurrentMonth: isCurrentCalendarMonth(year, month),
      isFutureMonth: isFutureCalendarMonth(year, month),
      canSync: isDreMonthSyncable(year, month),
      syncedAt: snapshot?.syncedAt.toISOString() ?? null,
      billingSource: payload?.billingSource ?? null,
      isPartial: payload?.isPartial ?? false,
      incompleteProductCostCount: payload?.incompleteProductCostCount ?? 0,
      syncWarnings: payload?.syncWarnings ?? [],
      lines: payload ? snapshotPayloadToLines(payload) : null,
      adsCost: payload?.adsCost ?? null,
      fixedCostValues,
      fixedCostOverrides,
      totals,
    });
  }

  const yearLines =
    monthPayloads.length > 0
      ? sumYearLineAmounts(monthPayloads.map(snapshotPayloadToLines))
      : null;

  const yearAds = monthPayloads.reduce((sum, p) => sum + p.adsCost, 0);

  const yearFixedByItem = new Map<string, number>();
  for (const item of costItems) {
    let sum = 0;
    for (let month = 1; month <= 12; month += 1) {
      sum += effectiveByMonth[month]?.[item.id] ?? 0;
    }
    yearFixedByItem.set(item.id, sum);
  }

  const yearManualFixed = costItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearFixedByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearTotals =
    yearLines !== null
      ? computeDreTotals(yearLines, yearAds, yearManualFixed)
      : yearManualFixed.length > 0
        ? computeDreTotals(
            {
              revenueMl: 0,
              cancelledSalesMl: 0,
              saleFeeMl: 0,
              partialReturnsMl: 0,
              productCostErp: 0,
              taxErp: 0,
              sellerShippingMl: 0,
            },
            0,
            yearManualFixed,
          )
        : null;

  return {
    year,
    costItems,
    months,
    yearTotals,
  };
}
