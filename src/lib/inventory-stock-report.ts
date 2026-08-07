import { reportsConfig } from "@/config/reports";
import { roundMoney } from "@/lib/financial-margin";
import { getZonedParts, zonedLocalToUtc } from "@/lib/report-timezone";
import {
  computeEffectivePricingCost,
  normalizeProductSku,
} from "@/lib/product-pricing";

const MONTH_NAMES_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
] as const;

export const DEFAULT_STOCK_REPORT_COMPANY = "Shopping Um a Um LTDA";

export type StockReportListingAdjustment = {
  salesAfterSnapshot: number;
  nfEmitidaNaoEntregue: number;
  ajusteManual: number;
};

export type StockReportListingSnapshotSource =
  | { kind: "sales" }
  | { kind: "catalog_snapshot"; mlStockAtSnapshot: number; snapshotAt: string };

export type StockReportListingState = {
  adjustment: StockReportListingAdjustment;
  snapshotSource: StockReportListingSnapshotSource;
};

export type StockReportProductInfo = {
  ncm: string | null;
  unitCost: number | null;
  hasIcmsSt: boolean;
};

export type StockReportListingInput = {
  mlItemId: string;
  sku: string | null;
  title: string;
  mlStock: number;
  warehouseStock: number;
  mlStockOnTheWay: number;
  catalogListing?: boolean;
};

export type StockReportRow = {
  rowKey: string;
  label: string;
  skus: string[];
  ncm: string | null;
  unitCost: number | null;
  units: number;
  stockValue: number | null;
  missingCost: boolean;
};

export type StockReportHeader = {
  companyName: string;
  subtitle: string;
};

export type StockReportMergeGroup = {
  id: string;
  skuKeys: string[];
  anchorSkuKey: string;
  label?: string;
  ncmOverride?: string | null;
};

export type StockReportBuildResult = {
  rows: StockReportRow[];
  totalValue: number;
  missingCostCount: number;
};

const EMPTY_ADJUSTMENT: StockReportListingAdjustment = {
  salesAfterSnapshot: 0,
  nfEmitidaNaoEntregue: 0,
  ajusteManual: 0,
};

const SALES_SNAPSHOT_SOURCE: StockReportListingSnapshotSource = { kind: "sales" };

export function stockUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function manualUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.floor(value);
}

export function inventoryBaseUnits(
  row: Pick<
    StockReportListingInput,
    "warehouseStock" | "mlStock" | "mlStockOnTheWay"
  >,
): number {
  return (
    stockUnits(row.warehouseStock) +
    stockUnits(row.mlStock) +
    stockUnits(row.mlStockOnTheWay)
  );
}

export function listingUnitsAtSnapshot(
  row: StockReportListingInput,
  adjustment: StockReportListingAdjustment = EMPTY_ADJUSTMENT,
  snapshotSource: StockReportListingSnapshotSource = SALES_SNAPSHOT_SOURCE,
): number {
  const nf = stockUnits(adjustment.nfEmitidaNaoEntregue);
  const manual = manualUnits(adjustment.ajusteManual);

  const base =
    snapshotSource.kind === "catalog_snapshot"
      ? stockUnits(snapshotSource.mlStockAtSnapshot) +
        stockUnits(row.warehouseStock) +
        stockUnits(row.mlStockOnTheWay)
      : inventoryBaseUnits(row) + stockUnits(adjustment.salesAfterSnapshot);

  return Math.max(0, base + nf + manual);
}

export function listingStateFor(
  map: Record<string, StockReportListingState | undefined>,
  mlItemId: string,
): StockReportListingState {
  return (
    map[mlItemId] ?? {
      adjustment: EMPTY_ADJUSTMENT,
      snapshotSource: SALES_SNAPSHOT_SOURCE,
    }
  );
}

export function listingTotalUnits(
  row: StockReportListingInput,
  state: StockReportListingState,
): number {
  return listingUnitsAtSnapshot(row, state.adjustment, state.snapshotSource);
}

/** Detalhamento auditável de como o total de um anúncio foi calculado — cada
 * parcela que entra na soma, para exibição transparente na UI. */
export type ListingAuditBreakdown = {
  warehouseStock: number;
  mlStockOnTheWay: number;
  /** Estoque ML de hoje (sempre calculado, mesmo quando não é a fonte usada). */
  mlStockToday: number;
  mlStockSource: "today" | "catalog_snapshot";
  /** Estoque ML no snapshot de catálogo, quando essa é a fonte usada. */
  mlStockAtSnapshot: number | null;
  snapshotAt: string | null;
  salesAfterSnapshot: number;
  nfEmitidaNaoEntregue: number;
  ajusteManual: number;
  total: number;
};

export function listingAuditBreakdown(
  row: StockReportListingInput,
  state: StockReportListingState,
): ListingAuditBreakdown {
  const snapshotSource = state.snapshotSource;
  const usesCatalogSnapshot = snapshotSource.kind === "catalog_snapshot";
  return {
    warehouseStock: stockUnits(row.warehouseStock),
    mlStockOnTheWay: stockUnits(row.mlStockOnTheWay),
    mlStockToday: stockUnits(row.mlStock),
    mlStockSource: usesCatalogSnapshot ? "catalog_snapshot" : "today",
    mlStockAtSnapshot:
      snapshotSource.kind === "catalog_snapshot"
        ? stockUnits(snapshotSource.mlStockAtSnapshot)
        : null,
    snapshotAt:
      snapshotSource.kind === "catalog_snapshot"
        ? snapshotSource.snapshotAt
        : null,
    salesAfterSnapshot: usesCatalogSnapshot
      ? 0
      : stockUnits(state.adjustment.salesAfterSnapshot),
    nfEmitidaNaoEntregue: stockUnits(state.adjustment.nfEmitidaNaoEntregue),
    ajusteManual: manualUnits(state.adjustment.ajusteManual),
    total: listingUnitsAtSnapshot(row, state.adjustment, state.snapshotSource),
  };
}

export function skuKeyFromListing(sku: string | null, mlItemId: string): string {
  const normalized = sku ? normalizeProductSku(sku) : "";
  return normalized || `__no_sku__:${mlItemId}`;
}

export function skuLabelFromKey(skuKey: string): string {
  if (skuKey.startsWith("__no_sku__:")) return "Sem SKU";
  return skuKey;
}

export function defaultStockReportSnapshotDate(
  now: Date = new Date(),
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): Date {
  const parts = getZonedParts(now, timeZone);
  let year = parts.year;
  let month = parts.month - 1;
  if (month < 1) {
    month = 12;
    year -= 1;
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  return zonedLocalToUtc(
    year,
    month,
    daysInMonth,
    23,
    59,
    59,
    999,
    timeZone,
  );
}

/** @deprecated Use defaultStockReportSnapshotDate */
export function defaultStockReportReferenceDate(
  now: Date = new Date(),
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): Date {
  return defaultStockReportSnapshotDate(now, timeZone);
}

export function formatStockReportSnapshotDateInput(
  date: Date,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): string {
  const parts = getZonedParts(date, timeZone);
  const y = String(parts.year);
  const m = String(parts.month).padStart(2, "0");
  const d = String(parts.day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseStockReportSnapshotDateInput(
  value: string,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day > daysInMonth) return null;
  return zonedLocalToUtc(year, month, day, 23, 59, 59, 999, timeZone);
}

export function stockReportSalesAdjustmentRange(
  snapshotDate: Date,
  asOf: Date = new Date(),
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): { from: Date; to: Date } | null {
  const parts = getZonedParts(snapshotDate, timeZone);
  const snapshotDayEnd = zonedLocalToUtc(
    parts.year,
    parts.month,
    parts.day,
    23,
    59,
    59,
    999,
    timeZone,
  );
  if (snapshotDayEnd.getTime() >= asOf.getTime()) return null;

  const noonUtc = zonedLocalToUtc(
    parts.year,
    parts.month,
    parts.day,
    12,
    0,
    0,
    0,
    timeZone,
  );
  const nextDay = getZonedParts(
    new Date(noonUtc.getTime() + 24 * 60 * 60 * 1000),
    timeZone,
  );
  const from = zonedLocalToUtc(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    0,
    0,
    0,
    0,
    timeZone,
  );
  return { from, to: asOf };
}

export function formatStockReportSubtitle(
  date: Date,
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): string {
  const parts = getZonedParts(date, timeZone);
  const monthName = MONTH_NAMES_PT[parts.month - 1] ?? String(parts.month);
  return `Saldo em Estoque dia ${parts.day} de ${monthName} de ${parts.year}`;
}

export function buildDefaultStockReportHeader(
  now: Date = new Date(),
): StockReportHeader {
  const snapshotDate = defaultStockReportSnapshotDate(now);
  return {
    companyName: DEFAULT_STOCK_REPORT_COMPANY,
    subtitle: formatStockReportSubtitle(snapshotDate),
  };
}

const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

export function formatStockReportCurrency(value: number): string {
  return currencyFormatter.format(value);
}

export function formatStockReportUnits(value: number): string {
  return new Intl.NumberFormat("pt-BR").format(value);
}

/**
 * Custo unitário do relatório de estoque: mesmo "Custo de precificação"
 * exibido em Meus produtos (custo NF/ICMS-ST + IPI).
 */
export function stockReportUnitCostFromProduct(product: {
  unitCostNf: number;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
  purchaseCostWithSt: number | null;
  ipiPercent: number;
}): number | null {
  return computeEffectivePricingCost({
    unitCostNf: product.unitCostNf,
    purchaseIcmsPercent: product.purchaseIcmsPercent,
    hasIcmsSt: product.hasIcmsSt,
    purchaseCostWithSt: product.purchaseCostWithSt,
    ipiPercent: product.ipiPercent,
    isMonophasic: false,
    pisCofinsPercent: 0,
  });
}

function productForSku(
  skuKey: string,
  productsBySku: Record<string, StockReportProductInfo | undefined>,
): StockReportProductInfo | undefined {
  if (skuKey.startsWith("__no_sku__:")) return undefined;
  return productsBySku[skuKey];
}

function buildSkuRow(
  skuKey: string,
  units: number,
  productsBySku: Record<string, StockReportProductInfo | undefined>,
): StockReportRow {
  const product = productForSku(skuKey, productsBySku);
  const unitCost = product?.unitCost ?? null;
  const missingCost = unitCost === null || unitCost < 0;
  const stockValue =
    missingCost || units <= 0 ? null : roundMoney(units * unitCost);

  return {
    rowKey: skuKey,
    label: skuLabelFromKey(skuKey),
    skus: skuKey.startsWith("__no_sku__:") ? [] : [skuKey],
    ncm: product?.ncm ?? null,
    unitCost: missingCost ? null : unitCost,
    units,
    stockValue,
    missingCost,
  };
}

export function aggregateStockReportBySku(
  listings: StockReportListingInput[],
  listingStatesByMlItemId: Record<string, StockReportListingState | undefined>,
  productsBySku: Record<string, StockReportProductInfo | undefined>,
): StockReportRow[] {
  const unitsBySku = new Map<string, number>();

  for (const listing of listings) {
    const skuKey = skuKeyFromListing(listing.sku, listing.mlItemId);
    const state = listingStateFor(listingStatesByMlItemId, listing.mlItemId);
    const units = listingTotalUnits(listing, state);
    if (units <= 0) continue;
    unitsBySku.set(skuKey, (unitsBySku.get(skuKey) ?? 0) + units);
  }

  return [...unitsBySku.entries()]
    .map(([skuKey, units]) => buildSkuRow(skuKey, units, productsBySku))
    .filter((row) => row.units > 0)
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }));
}

function filterPositiveUnitRows(rows: StockReportRow[]): StockReportRow[] {
  return rows.filter((row) => row.units > 0);
}

export function applyStockReportMergeGroups(
  rows: StockReportRow[],
  mergeGroups: StockReportMergeGroup[],
): StockReportRow[] {
  if (mergeGroups.length === 0) return filterPositiveUnitRows(rows);

  const mergedKeys = new Set<string>();
  const result: StockReportRow[] = [];

  for (const group of mergeGroups) {
    const members = group.skuKeys
      .map((key) => rows.find((row) => row.rowKey === key))
      .filter((row): row is StockReportRow => row != null);
    if (members.length < 2) continue;

    const anchor =
      members.find((row) => row.rowKey === group.anchorSkuKey) ?? members[0];

    for (const member of members) mergedKeys.add(member.rowKey);

    const units = members.reduce((sum, row) => sum + row.units, 0);
    const stockValue = members.reduce(
      (sum, row) => sum + (row.stockValue ?? 0),
      0,
    );
    const hasMissingCost = members.some((row) => row.missingCost);
    const unitCost =
      !hasMissingCost && units > 0
        ? roundMoney(stockValue / units)
        : null;

    const ncmOverride = group.ncmOverride?.trim();
    result.push({
      rowKey: group.id,
      label: group.label?.trim() || anchor.label,
      skus: members.flatMap((row) => row.skus),
      ncm: ncmOverride || anchor.ncm,
      unitCost,
      units,
      stockValue: hasMissingCost ? null : roundMoney(stockValue),
      missingCost: hasMissingCost,
    });
  }

  for (const row of rows) {
    if (!mergedKeys.has(row.rowKey)) result.push(row);
  }

  return filterPositiveUnitRows(result).sort((a, b) =>
    a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
  );
}

export function buildStockReportRows(
  listings: StockReportListingInput[],
  listingStatesByMlItemId: Record<string, StockReportListingState | undefined>,
  productsBySku: Record<string, StockReportProductInfo | undefined>,
  mergeGroups: StockReportMergeGroup[] = [],
): StockReportBuildResult {
  const aggregated = aggregateStockReportBySku(
    listings,
    listingStatesByMlItemId,
    productsBySku,
  );
  const rows = applyStockReportMergeGroups(aggregated, mergeGroups);
  const missingCostCount = rows.filter((row) => row.missingCost).length;
  const totalValue = roundMoney(
    rows.reduce((sum, row) => sum + (row.stockValue ?? 0), 0),
  );

  return { rows, totalValue, missingCostCount };
}

export function buildStockReportFilename(
  referenceDate: Date,
  extension: "pdf" | "xlsx",
): string {
  const parts = getZonedParts(
    referenceDate,
    reportsConfig.catalogCompetitionTimezone,
  );
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");
  return `saldo-estoque-${parts.year}-${month}-${day}.${extension}`;
}
