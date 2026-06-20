import { reportsConfig } from "@/config/reports";
import { roundMoney } from "@/lib/financial-margin";
import { getCalendarMonthRange } from "@/lib/mercadolibre/revenue-periods";
import { normalizeProductSku } from "@/lib/product-pricing";
import { getZonedParts } from "@/lib/report-timezone";

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

export type StockReportListingExtras = {
  vendasMesSeguinte: number;
  nfEmitidaNaoEntregue: number;
  estoqueExtra: number;
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

function stockUnits(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
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

export function listingTotalUnits(
  row: StockReportListingInput,
  extras: StockReportListingExtras,
): number {
  return (
    inventoryBaseUnits(row) +
    stockUnits(extras.vendasMesSeguinte) +
    stockUnits(extras.nfEmitidaNaoEntregue) +
    stockUnits(extras.estoqueExtra)
  );
}

export function skuKeyFromListing(sku: string | null, mlItemId: string): string {
  const normalized = sku ? normalizeProductSku(sku) : "";
  return normalized || `__no_sku__:${mlItemId}`;
}

export function skuLabelFromKey(skuKey: string): string {
  if (skuKey.startsWith("__no_sku__:")) return "Sem SKU";
  return skuKey;
}

export function defaultStockReportReferenceDate(
  now: Date = new Date(),
  timeZone: string = reportsConfig.catalogCompetitionTimezone,
): Date {
  const parts = getZonedParts(now, timeZone);
  return getCalendarMonthRange(parts.year, parts.month, timeZone).to;
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
  const referenceDate = defaultStockReportReferenceDate(now);
  return {
    companyName: DEFAULT_STOCK_REPORT_COMPANY,
    subtitle: formatStockReportSubtitle(referenceDate),
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

export function stockReportUnitCostFromProduct(product: {
  unitCostNf: number;
  hasIcmsSt: boolean;
  purchaseCostWithSt: number | null;
}): number | null {
  if (product.hasIcmsSt) {
    if (
      product.purchaseCostWithSt === null ||
      !Number.isFinite(product.purchaseCostWithSt) ||
      product.purchaseCostWithSt < 0
    ) {
      return null;
    }
    return product.purchaseCostWithSt;
  }
  if (!Number.isFinite(product.unitCostNf) || product.unitCostNf < 0) {
    return null;
  }
  return product.unitCostNf;
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
  extrasByMlItemId: Record<string, StockReportListingExtras | undefined>,
  productsBySku: Record<string, StockReportProductInfo | undefined>,
): StockReportRow[] {
  const unitsBySku = new Map<string, number>();

  for (const listing of listings) {
    const skuKey = skuKeyFromListing(listing.sku, listing.mlItemId);
    const extras = extrasByMlItemId[listing.mlItemId] ?? {
      vendasMesSeguinte: 0,
      nfEmitidaNaoEntregue: 0,
      estoqueExtra: 0,
    };
    const units = listingTotalUnits(listing, extras);
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
  extrasByMlItemId: Record<string, StockReportListingExtras | undefined>,
  productsBySku: Record<string, StockReportProductInfo | undefined>,
  mergeGroups: StockReportMergeGroup[] = [],
): StockReportBuildResult {
  const aggregated = aggregateStockReportBySku(
    listings,
    extrasByMlItemId,
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
  return `saldo-estoque-${parts.year}-${month}.${extension}`;
}
