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
  fixedCostValues: Record<string, number | null>;
  fixedCostOverrides: Record<string, number | null>;
  operationalCostValues: Record<string, number | null>;
  operationalCostOverrides: Record<string, number | null>;
  totals: DreComputedTotals | null;
};

export type DreYearView = {
  year: number;
  costItems: DreCostItemView[];
  operationalCostItems: DreCostItemView[];
  months: DreMonthView[];
  yearTotals: DreComputedTotals | null;
};

function buildMonthTotals(
  payload: DreMonthSnapshotPayload | null,
  fixedCostItems: DreCostItemView[],
  operationalCostItems: DreCostItemView[],
  fixedCostValues: Record<string, number | null>,
  operationalCostValues: Record<string, number | null>,
): DreComputedTotals | null {
  const fixed = fixedCostItems.map((item) => ({
    costItemId: item.id,
    amount: fixedCostValues[item.id] ?? 0,
  }));
  const operational = operationalCostItems.map((item) => ({
    costItemId: item.id,
    amount: operationalCostValues[item.id] ?? 0,
  }));

  if (!payload) {
    const manualOnly = [...fixed, ...operational].filter((row) => row.amount > 0);
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
        fullShippingMl: 0,
        fullStorageMl: 0,
        fullNonComplianceMl: 0,
      },
      0,
      fixed.filter((row) => row.amount > 0),
      operational.filter((row) => row.amount > 0),
    );
  }

  return computeDreTotals(
    snapshotPayloadToLines(payload),
    payload.adsCost,
    fixed.filter((row) => row.amount > 0),
    operational.filter((row) => row.amount > 0),
  );
}

function buildEffectiveCostMaps(
  costItems: DreCostItemView[],
  year: number,
  explicitMap: Map<string, number>,
): {
  valuesByMonth: Record<number, Record<string, number | null>>;
  overridesByMonth: Record<number, Record<string, number | null>>;
} {
  const costItemIds = costItems.map((item) => item.id);
  const effectiveByMonth = resolveEffectiveFixedCostsForYear(
    costItemIds,
    year,
    explicitMap,
  );

  const valuesByMonth: Record<number, Record<string, number | null>> = {};
  const overridesByMonth: Record<number, Record<string, number | null>> = {};

  for (let month = 1; month <= 12; month += 1) {
    valuesByMonth[month] = {};
    overridesByMonth[month] = {};
    for (const item of costItems) {
      overridesByMonth[month][item.id] = explicitFixedCostOverride(
        explicitMap,
        year,
        month,
        item.id,
      );
      valuesByMonth[month][item.id] =
        effectiveByMonth[month]?.[item.id] ?? null;
    }
  }

  return { valuesByMonth, overridesByMonth };
}

export async function loadDreYearView(year: number): Promise<DreYearView> {
  const [allCostItems, snapshots, monthValues] = await Promise.all([
    prisma.dreCostItem.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, sortOrder: true, section: true },
    }),
    prisma.dreMonthSnapshot.findMany({
      where: { year },
    }),
    prisma.dreCostMonthValue.findMany({
      where: { year: { in: [year, year - 1] } },
      select: { costItemId: true, year: true, month: true, amount: true },
    }),
  ]);

  const costItems = allCostItems
    .filter((item) => item.section === "FIXED")
    .map(({ id, name, sortOrder }) => ({ id, name, sortOrder }));
  const operationalCostItems = allCostItems
    .filter((item) => item.section === "OPERATIONAL")
    .map(({ id, name, sortOrder }) => ({ id, name, sortOrder }));

  const snapshotByMonth = new Map(
    snapshots.map((row) => [row.month, row]),
  );

  const explicitMap = buildExplicitFixedCostMap(monthValues);
  const fixedMaps = buildEffectiveCostMaps(costItems, year, explicitMap);
  const operationalMaps = buildEffectiveCostMaps(
    operationalCostItems,
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

    const fixedCostValues = fixedMaps.valuesByMonth[month] ?? {};
    const fixedCostOverrides = fixedMaps.overridesByMonth[month] ?? {};
    const operationalCostValues = operationalMaps.valuesByMonth[month] ?? {};
    const operationalCostOverrides =
      operationalMaps.overridesByMonth[month] ?? {};

    const totals = buildMonthTotals(
      payload,
      costItems,
      operationalCostItems,
      fixedCostValues,
      operationalCostValues,
    );

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
      operationalCostValues,
      operationalCostOverrides,
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
      sum += fixedMaps.valuesByMonth[month]?.[item.id] ?? 0;
    }
    yearFixedByItem.set(item.id, sum);
  }

  const yearOperationalByItem = new Map<string, number>();
  for (const item of operationalCostItems) {
    let sum = 0;
    for (let month = 1; month <= 12; month += 1) {
      sum += operationalMaps.valuesByMonth[month]?.[item.id] ?? 0;
    }
    yearOperationalByItem.set(item.id, sum);
  }

  const yearManualFixed = costItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearFixedByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearManualOperational = operationalCostItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearOperationalByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearTotals =
    yearLines !== null
      ? computeDreTotals(
          yearLines,
          yearAds,
          yearManualFixed,
          yearManualOperational,
        )
      : yearManualFixed.length > 0 || yearManualOperational.length > 0
        ? computeDreTotals(
            {
              revenueMl: 0,
              cancelledSalesMl: 0,
              saleFeeMl: 0,
              partialReturnsMl: 0,
              productCostErp: 0,
              taxErp: 0,
              sellerShippingMl: 0,
              fullShippingMl: 0,
              fullStorageMl: 0,
              fullNonComplianceMl: 0,
            },
            0,
            yearManualFixed,
            yearManualOperational,
          )
        : null;

  return {
    year,
    costItems,
    operationalCostItems,
    months,
    yearTotals,
  };
}
