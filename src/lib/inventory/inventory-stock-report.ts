import { reportsConfig } from "@/config/reports";
import { formatMoneyBRL } from "@/lib/format-money";
import { roundMoney } from "@/lib/pricing/financial-margin";
import { getZonedParts, zonedLocalToUtc } from "@/lib/report-timezone";
import {
  computeEffectivePricingCost,
  normalizeProductSku,
} from "@/lib/pricing/product-pricing";

export const MONTH_NAMES_PT = [
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

/**
 * Correções locais opcionais aplicadas na hora de gerar o relatório do
 * fechamento — não persistem, servem só pra ajustar a exibição/exportação
 * quando o usuário sabe de algo que o snapshot não capturou (ex.: NF já
 * emitida mas ainda não entregue).
 */
export type StockReportListingAdjustment = {
  nfEmitidaNaoEntregue: number;
  ajusteManual: number;
};

export type StockReportListingState = {
  adjustment: StockReportListingAdjustment;
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
  nfEmitidaNaoEntregue: 0,
  ajusteManual: 0,
};

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

/**
 * Unidades de um anúncio no relatório: base congelada do snapshot (galpão +
 * ML + a caminho) mais as correções locais opcionais.
 */
export function listingUnitsAtSnapshot(
  row: StockReportListingInput,
  adjustment: StockReportListingAdjustment = EMPTY_ADJUSTMENT,
): number {
  const nf = stockUnits(adjustment.nfEmitidaNaoEntregue);
  const manual = manualUnits(adjustment.ajusteManual);
  return Math.max(0, inventoryBaseUnits(row) + nf + manual);
}

export function listingStateFor(
  map: Record<string, StockReportListingState | undefined>,
  mlItemId: string,
): StockReportListingState {
  return map[mlItemId] ?? { adjustment: EMPTY_ADJUSTMENT };
}

export function listingTotalUnits(
  row: StockReportListingInput,
  state: StockReportListingState,
): number {
  return listingUnitsAtSnapshot(row, state.adjustment);
}

/** Detalhamento auditável de como o total de um anúncio foi calculado — cada
 * parcela que entra na soma, para exibição transparente na UI. */
export type ListingAuditBreakdown = {
  warehouseStock: number;
  mlStock: number;
  mlStockOnTheWay: number;
  nfEmitidaNaoEntregue: number;
  ajusteManual: number;
  total: number;
};

export function listingAuditBreakdown(
  row: StockReportListingInput,
  state: StockReportListingState,
): ListingAuditBreakdown {
  return {
    warehouseStock: stockUnits(row.warehouseStock),
    mlStock: stockUnits(row.mlStock),
    mlStockOnTheWay: stockUnits(row.mlStockOnTheWay),
    nfEmitidaNaoEntregue: stockUnits(state.adjustment.nfEmitidaNaoEntregue),
    ajusteManual: manualUnits(state.adjustment.ajusteManual),
    total: listingUnitsAtSnapshot(row, state.adjustment),
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

/** Último dia do último mês já fechado (23:59:59 no timezone configurado) — usado pelo cron de fechamento pra decidir qual mês fechar. */
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

export const formatStockReportCurrency = formatMoneyBRL;

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
