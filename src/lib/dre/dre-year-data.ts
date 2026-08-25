import {
  applyDreIncludeCancelledView,
  computeDreTotals,
  sumYearLineAmounts,
  type DreCancelledIncludeOverlay,
  type DreComputedTotals,
  type DreEditableLineKey,
  type DreLineAmounts,
  type DreLineBreakdownItem,
  type DreMonthSnapshotPayload,
  type DreProductCostBreakdownItem,
  type DreTaxBreakdownItem,
} from "@/lib/dre/dre-calculations";
import { prisma } from "@/lib/db";
import {
  parseSnapshotPayload,
  snapshotPayloadToLines,
} from "@/lib/dre/dre-month-data";
import {
  buildExplicitFixedCostMap,
  explicitFixedCostOverride,
  resolveEffectiveFixedCostsForYear,
} from "@/lib/dre/dre-fixed-costs";
import {
  listFullShipmentActivityMonthsForYear,
  listImportedBillingPeriods,
} from "@/lib/envios-full/full-shipment-data";
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
  recurring: boolean;
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
  cancelledIncludeOverlay: DreCancelledIncludeOverlay | null;
  productCostBreakdown: DreProductCostBreakdownItem[] | null;
  taxBreakdown: DreTaxBreakdownItem[] | null;
  revenueBreakdown: DreLineBreakdownItem[] | null;
  cancelledSalesBreakdown: DreLineBreakdownItem[] | null;
  saleFeeBreakdown: DreLineBreakdownItem[] | null;
  sellerShippingBreakdown: DreLineBreakdownItem[] | null;
  adsCostBreakdown: DreLineBreakdownItem[] | null;
  partialReturnsBreakdown: DreLineBreakdownItem[] | null;
  returnFeeBreakdown: DreLineBreakdownItem[] | null;
  specialFeesBreakdown: DreLineBreakdownItem[] | null;
  fullShippingBreakdown: DreLineBreakdownItem[] | null;
  fullStorageBreakdown: DreLineBreakdownItem[] | null;
  fullNonComplianceBreakdown: DreLineBreakdownItem[] | null;
  minhaPaginaBreakdown: DreLineBreakdownItem[] | null;
  affiliateFeeBreakdown: DreLineBreakdownItem[] | null;
  pendingReconciliationImportId: string | null;
  pendingReconciliationApplied: boolean;
  /**
   * true quando o Relatório Full já tem envios para o mês (import ML ou
   * manual) — usado só para o alerta de UI; o valor na célula ainda vem do
   * snapshot até a próxima sync do DRE.
   */
  fullReportSourced: boolean;
  adsCost: number | null;
  /** Linhas ML/ERP/ADS ajustadas manualmente após o último sync. */
  manuallyEditedLineKeys: DreEditableLineKey[];
  /** Baseline do sync disponível para restaurar (chaves presentes). */
  syncedLineBaselineKeys: DreEditableLineKey[];
  fixedCostValues: Record<string, number | null>;
  fixedCostOverrides: Record<string, number | null>;
  operationalCostValues: Record<string, number | null>;
  operationalCostOverrides: Record<string, number | null>;
  investmentCostValues: Record<string, number | null>;
  investmentCostOverrides: Record<string, number | null>;
  nonOperationalOutValues: Record<string, number | null>;
  nonOperationalOutOverrides: Record<string, number | null>;
  nonOperationalInValues: Record<string, number | null>;
  nonOperationalInOverrides: Record<string, number | null>;
  totals: DreComputedTotals | null;
};

export type DreYearView = {
  year: number;
  costItems: DreCostItemView[];
  operationalCostItems: DreCostItemView[];
  investmentCostItems: DreCostItemView[];
  nonOperationalOutItems: DreCostItemView[];
  nonOperationalInItems: DreCostItemView[];
  months: DreMonthView[];
  yearTotals: DreComputedTotals | null;
};


function buildMonthTotals(
  payload: DreMonthSnapshotPayload | null,
  lines: DreLineAmounts | null,
  fixedCostItems: DreCostItemView[],
  operationalCostItems: DreCostItemView[],
  investmentCostItems: DreCostItemView[],
  nonOperationalOutItems: DreCostItemView[],
  nonOperationalInItems: DreCostItemView[],
  fixedCostValues: Record<string, number | null>,
  operationalCostValues: Record<string, number | null>,
  investmentCostValues: Record<string, number | null>,
  nonOperationalOutValues: Record<string, number | null>,
  nonOperationalInValues: Record<string, number | null>,
): DreComputedTotals | null {
  const fixed = fixedCostItems.map((item) => ({
    costItemId: item.id,
    amount: fixedCostValues[item.id] ?? 0,
  }));
  const operational = operationalCostItems.map((item) => ({
    costItemId: item.id,
    amount: operationalCostValues[item.id] ?? 0,
  }));
  const investment = investmentCostItems.map((item) => ({
    costItemId: item.id,
    amount: investmentCostValues[item.id] ?? 0,
  }));
  const nonOperationalOut = nonOperationalOutItems.map((item) => ({
    costItemId: item.id,
    amount: nonOperationalOutValues[item.id] ?? 0,
  }));
  const nonOperationalIn = nonOperationalInItems.map((item) => ({
    costItemId: item.id,
    amount: nonOperationalInValues[item.id] ?? 0,
  }));

  if (!payload || !lines) {
    const manualOnly = [
      ...fixed,
      ...operational,
      ...investment,
      ...nonOperationalOut,
      ...nonOperationalIn,
    ].filter((row) => row.amount > 0);
    if (manualOnly.length === 0) return null;
    return computeDreTotals(
      {
        revenueMl: 0,
        cancelledSalesMl: 0,
        saleFeeMl: 0,
        partialReturnsMl: 0,
        returnFeeMl: 0,
        specialFeesMl: 0,
        productCostErp: 0,
        taxErp: 0,
        sellerShippingMl: 0,
        fullShippingMl: 0,
        fullStorageMl: 0,
        fullNonComplianceMl: 0,
        minhaPaginaMl: 0,
        affiliateFeeMl: 0,
      },
      0,
      fixed.filter((row) => row.amount > 0),
      operational.filter((row) => row.amount > 0),
      investment.filter((row) => row.amount > 0),
      nonOperationalOut.filter((row) => row.amount > 0),
      nonOperationalIn.filter((row) => row.amount > 0),
    );
  }

  return computeDreTotals(
    lines,
    payload.adsCost,
    fixed.filter((row) => row.amount > 0),
    operational.filter((row) => row.amount > 0),
    investment.filter((row) => row.amount > 0),
    nonOperationalOut.filter((row) => row.amount > 0),
    nonOperationalIn.filter((row) => row.amount > 0),
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
  const recurringByItemId = new Map(
    costItems.map((item) => [item.id, item.recurring] as const),
  );
  const effectiveByMonth = resolveEffectiveFixedCostsForYear(
    costItemIds,
    year,
    explicitMap,
    recurringByItemId,
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

export async function loadDreYearView(
  organizationId: string,
  year: number,
): Promise<DreYearView> {
  const [
    allCostItems,
    snapshots,
    monthValues,
    fullShipmentMonths,
    importedBillingPeriods,
    pendingReconciliationImports,
  ] = await Promise.all([
    prisma.dreCostItem.findMany({
      where: { organizationId, active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        sortOrder: true,
        section: true,
        recurring: true,
      },
    }),
    prisma.dreMonthSnapshot.findMany({
      where: { organizationId, year },
    }),
    prisma.dreCostMonthValue.findMany({
      where: { organizationId, year: { in: [year, year - 1] } },
      select: { costItemId: true, year: true, month: true, amount: true },
    }),
    listFullShipmentActivityMonthsForYear(organizationId, year),
    listImportedBillingPeriods(organizationId),
    prisma.dreReconciliationImport.findMany({
      where: { organizationId, year, status: "pending" },
      select: { id: true, month: true, appliedAt: true },
    }),
  ]);

  const pendingReconciliationByMonth = new Map(
    pendingReconciliationImports.map((row) => [row.month, row]),
  );

  const importedBillingMonths = new Set(
    importedBillingPeriods
      .filter((period) => period.year === year)
      .map((period) => period.month),
  );

  const costItems = allCostItems
    .filter((item) => item.section === "FIXED")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));
  const operationalCostItems = allCostItems
    .filter((item) => item.section === "OPERATIONAL")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));
  const investmentCostItems = allCostItems
    .filter((item) => item.section === "INVESTMENT")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));
  const nonOperationalOutItems = allCostItems
    .filter((item) => item.section === "NON_OPERATIONAL_OUT")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));
  const nonOperationalInItems = allCostItems
    .filter((item) => item.section === "NON_OPERATIONAL_IN")
    .map(({ id, name, sortOrder, recurring }) => ({
      id,
      name,
      sortOrder,
      recurring,
    }));

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
  const investmentMaps = buildEffectiveCostMaps(
    investmentCostItems,
    year,
    explicitMap,
  );
  const nonOperationalOutMaps = buildEffectiveCostMaps(
    nonOperationalOutItems,
    year,
    explicitMap,
  );
  const nonOperationalInMaps = buildEffectiveCostMaps(
    nonOperationalInItems,
    year,
    explicitMap,
  );

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
    const investmentCostValues = investmentMaps.valuesByMonth[month] ?? {};
    const investmentCostOverrides =
      investmentMaps.overridesByMonth[month] ?? {};
    const nonOperationalOutValues =
      nonOperationalOutMaps.valuesByMonth[month] ?? {};
    const nonOperationalOutOverrides =
      nonOperationalOutMaps.overridesByMonth[month] ?? {};
    const nonOperationalInValues =
      nonOperationalInMaps.valuesByMonth[month] ?? {};
    const nonOperationalInOverrides =
      nonOperationalInMaps.overridesByMonth[month] ?? {};

    const lines = payload
      ? applyDreIncludeCancelledView(
          snapshotPayloadToLines(payload),
          payload.cancelledIncludeOverlay,
        )
      : null;

    const totals = buildMonthTotals(
      payload,
      lines,
      costItems,
      operationalCostItems,
      investmentCostItems,
      nonOperationalOutItems,
      nonOperationalInItems,
      fixedCostValues,
      operationalCostValues,
      investmentCostValues,
      nonOperationalOutValues,
      nonOperationalInValues,
    );

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
      lines,
      cancelledIncludeOverlay: payload?.cancelledIncludeOverlay ?? null,
      productCostBreakdown: payload?.productCostBreakdown ?? null,
      taxBreakdown: payload?.taxBreakdown ?? null,
      revenueBreakdown: payload?.revenueBreakdown ?? null,
      cancelledSalesBreakdown: payload?.cancelledSalesBreakdown ?? null,
      saleFeeBreakdown: payload?.saleFeeBreakdown ?? null,
      sellerShippingBreakdown: payload?.sellerShippingBreakdown ?? null,
      adsCostBreakdown: payload?.adsCostBreakdown ?? null,
      partialReturnsBreakdown: payload?.partialReturnsBreakdown ?? null,
      returnFeeBreakdown: payload?.returnFeeBreakdown ?? null,
      specialFeesBreakdown: payload?.specialFeesBreakdown ?? null,
      fullShippingBreakdown: payload?.fullShippingBreakdown ?? null,
      fullStorageBreakdown: payload?.fullStorageBreakdown ?? null,
      fullNonComplianceBreakdown: payload?.fullNonComplianceBreakdown ?? null,
      minhaPaginaBreakdown: payload?.minhaPaginaBreakdown ?? null,
      affiliateFeeBreakdown: payload?.affiliateFeeBreakdown ?? null,
      pendingReconciliationImportId:
        pendingReconciliationByMonth.get(month)?.id ?? null,
      pendingReconciliationApplied: Boolean(
        pendingReconciliationByMonth.get(month)?.appliedAt,
      ),
      // Checagem ao vivo (não só o flag do snapshot): snapshots antigos não
      // tinham `fullReportSourced`, e importar depois da sync também conta.
      fullReportSourced:
        fullShipmentMonths.has(month) || importedBillingMonths.has(month),
      adsCost: payload?.adsCost ?? null,
      manuallyEditedLineKeys: payload?.manuallyEditedLineKeys ?? [],
      // Só considera o baseline se ele veio de um sync real — senão o
      // baseline "fantasma" semeado por `applyManualLineEdit` num snapshot
      // vazio faria o botão "Restaurar" reverter pro valor pré-edição (ex. 0)
      // em vez de um valor de sync de verdade.
      syncedLineBaselineKeys:
        payload?.hasRealSyncBaseline && payload.syncedLineBaseline
          ? (Object.keys(payload.syncedLineBaseline) as DreEditableLineKey[])
          : [],
      fixedCostValues,
      fixedCostOverrides,
      operationalCostValues,
      operationalCostOverrides,
      investmentCostValues,
      investmentCostOverrides,
      nonOperationalOutValues,
      nonOperationalOutOverrides,
      nonOperationalInValues,
      nonOperationalInOverrides,
      totals,
    });
  }

  const yearTotals = buildYearTotals(
    months,
    costItems,
    operationalCostItems,
    investmentCostItems,
    nonOperationalOutItems,
    nonOperationalInItems,
  );

  return {
    year,
    costItems,
    operationalCostItems,
    investmentCostItems,
    nonOperationalOutItems,
    nonOperationalInItems,
    months,
    yearTotals,
  };
}

function buildYearTotals(
  months: DreMonthView[],
  costItems: DreCostItemView[],
  operationalCostItems: DreCostItemView[],
  investmentCostItems: DreCostItemView[],
  nonOperationalOutItems: DreCostItemView[],
  nonOperationalInItems: DreCostItemView[],
): DreComputedTotals | null {
  const monthLines = months
    .map((month) => month.lines)
    .filter((lines): lines is DreLineAmounts => lines !== null);

  const yearLines =
    monthLines.length > 0 ? sumYearLineAmounts(monthLines) : null;

  const yearAds = months.reduce((sum, month) => sum + (month.adsCost ?? 0), 0);

  const yearFixedByItem = new Map<string, number>();
  for (const item of costItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.fixedCostValues[item.id] ?? 0;
    }
    yearFixedByItem.set(item.id, sum);
  }

  const yearOperationalByItem = new Map<string, number>();
  for (const item of operationalCostItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.operationalCostValues[item.id] ?? 0;
    }
    yearOperationalByItem.set(item.id, sum);
  }

  const yearInvestmentByItem = new Map<string, number>();
  for (const item of investmentCostItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.investmentCostValues[item.id] ?? 0;
    }
    yearInvestmentByItem.set(item.id, sum);
  }

  const yearNonOperationalOutByItem = new Map<string, number>();
  for (const item of nonOperationalOutItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.nonOperationalOutValues[item.id] ?? 0;
    }
    yearNonOperationalOutByItem.set(item.id, sum);
  }

  const yearNonOperationalInByItem = new Map<string, number>();
  for (const item of nonOperationalInItems) {
    let sum = 0;
    for (const month of months) {
      sum += month.nonOperationalInValues[item.id] ?? 0;
    }
    yearNonOperationalInByItem.set(item.id, sum);
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

  const yearManualInvestment = investmentCostItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearInvestmentByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearManualNonOperationalOut = nonOperationalOutItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearNonOperationalOutByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  const yearManualNonOperationalIn = nonOperationalInItems
    .map((item) => ({
      costItemId: item.id,
      amount: yearNonOperationalInByItem.get(item.id) ?? 0,
    }))
    .filter((row) => row.amount > 0);

  if (yearLines !== null) {
    return computeDreTotals(
      yearLines,
      yearAds,
      yearManualFixed,
      yearManualOperational,
      yearManualInvestment,
      yearManualNonOperationalOut,
      yearManualNonOperationalIn,
    );
  }

  if (
    yearManualFixed.length > 0 ||
    yearManualOperational.length > 0 ||
    yearManualInvestment.length > 0 ||
    yearManualNonOperationalOut.length > 0 ||
    yearManualNonOperationalIn.length > 0
  ) {
    return computeDreTotals(
      {
        revenueMl: 0,
        cancelledSalesMl: 0,
        saleFeeMl: 0,
        partialReturnsMl: 0,
        returnFeeMl: 0,
        specialFeesMl: 0,
        productCostErp: 0,
        taxErp: 0,
        sellerShippingMl: 0,
        fullShippingMl: 0,
        fullStorageMl: 0,
        fullNonComplianceMl: 0,
        minhaPaginaMl: 0,
        affiliateFeeMl: 0,
      },
      0,
      yearManualFixed,
      yearManualOperational,
      yearManualInvestment,
      yearManualNonOperationalOut,
      yearManualNonOperationalIn,
    );
  }

  return null;
}
