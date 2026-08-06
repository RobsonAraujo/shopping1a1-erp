import { prisma } from "@/lib/db";
import {
  DEFAULT_PIS_COFINS_PERCENT,
  normalizeProductSku,
  resolveProductPricing,
  type ProductRecordForPricing,
  type ResolvedProductPricing,
} from "@/lib/product-pricing";
import type { ProductTaxReportLookup } from "@/lib/product-tax-from-report";
import {
  indexBySkuWithAliases,
  resolveCanonicalSku,
  type SkuAliasMap,
} from "@/lib/product-sku-alias";
import { loadSkuAliasMap } from "@/lib/product-sku-alias-data";
import {
  DEFAULT_WHOLESALE_REDUCTIONS,
  WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT,
  type WholesaleReductionSettings,
} from "@/lib/wholesale-pricing";
import {
  stockReportUnitCostFromProduct,
  type StockReportProductInfo,
} from "@/lib/inventory-stock-report";
import type { CompanyTaxSettings, Product } from "@/generated/prisma/client";

function decimalToNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function productToPricingRecord(product: Product): ProductRecordForPricing {
  return {
    unitCostNf: decimalToNumber(product.unitCostNf) ?? 0,
    purchaseIcmsPercent: decimalToNumber(product.purchaseIcmsPercent) ?? 0,
    hasIcmsSt: product.hasIcmsSt,
    purchaseCostWithSt: decimalToNumber(product.purchaseCostWithSt),
    ipiPercent: decimalToNumber(product.ipiPercent) ?? 0,
    extraCosts: decimalToNumber(product.extraCosts) ?? 0,
    isMonophasic: product.isMonophasic,
    saleIcmsPercent: decimalToNumber(product.saleIcmsPercent) ?? 0,
  };
}

export type ProductView = ProductRecordForPricing & {
  sku: string;
  ncm: string | null;
  isImported: boolean;
  importContentPercent: number;
  pricingCost: number | null;
  /** % médio operacional de imposto vindo do relatório tributário (null = sem dados para o SKU). */
  taxPercent: number | null;
  /** Data (ISO) em que o snapshot usado para taxPercent foi gerado/recalculado. */
  taxPercentGeneratedAt: string | null;
  /** Mês/ano do relatório tributário de onde veio taxPercent (pode ser um mês anterior ao mais recente). */
  taxPercentYear: number | null;
  taxPercentMonth: number | null;
  createdAt: string;
  updatedAt: string;
};

export function buildProductView(
  product: Product,
  pisCofinsPercent: number,
  taxFromReport?: ProductTaxReportLookup,
): ProductView {
  const record = productToPricingRecord(product);
  const resolved = resolveProductPricing(record, pisCofinsPercent);
  const reportTax = taxFromReport?.bySku.get(normalizeProductSku(product.sku));
  return {
    sku: product.sku,
    ncm: product.ncm,
    ...record,
    isImported: product.isImported,
    importContentPercent: decimalToNumber(product.importContentPercent) ?? 0,
    pricingCost: resolved?.pricingCost ?? null,
    taxPercent: reportTax?.taxPercent ?? null,
    taxPercentGeneratedAt: reportTax?.generatedAt ?? null,
    taxPercentYear: reportTax?.year ?? null,
    taxPercentMonth: reportTax?.month ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export type CompanySettings = {
  pisCofinsPercent: number;
} & WholesaleReductionSettings;

function rowToCompanySettings(row: CompanyTaxSettings): CompanySettings {
  return {
    pisCofinsPercent:
      decimalToNumber(row.pisCofinsPercent) ?? DEFAULT_PIS_COFINS_PERCENT,
    level1ReductionPercent:
      decimalToNumber(row.wholesaleLevel1ReductionPercent) ??
      DEFAULT_WHOLESALE_REDUCTIONS.level1ReductionPercent,
    level2ReductionPercent:
      decimalToNumber(row.wholesaleLevel2ReductionPercent) ??
      DEFAULT_WHOLESALE_REDUCTIONS.level2ReductionPercent,
    level3ReductionPercent:
      decimalToNumber(row.wholesaleLevel3ReductionPercent) ??
      DEFAULT_WHOLESALE_REDUCTIONS.level3ReductionPercent,
    level1MinPurchaseUnit: WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT,
    level2MinPurchaseUnit:
      row.wholesaleLevel2MinPurchaseUnit ??
      DEFAULT_WHOLESALE_REDUCTIONS.level2MinPurchaseUnit,
    level3MinPurchaseUnit:
      row.wholesaleLevel3MinPurchaseUnit ??
      DEFAULT_WHOLESALE_REDUCTIONS.level3MinPurchaseUnit,
  };
}

export function validateWholesaleReductionPercent(value: unknown): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    return "Redução deve ser entre 0 e 100";
  }
  return null;
}

export async function getCompanySettings(): Promise<CompanySettings> {
  const row = await prisma.companyTaxSettings.findUnique({
    where: { id: "default" },
  });
  if (!row) {
    return {
      pisCofinsPercent: DEFAULT_PIS_COFINS_PERCENT,
      ...DEFAULT_WHOLESALE_REDUCTIONS,
    };
  }
  return rowToCompanySettings(row);
}

export async function ensureCompanySettings(): Promise<CompanySettings> {
  const existing = await prisma.companyTaxSettings.findUnique({
    where: { id: "default" },
  });
  if (existing) {
    return rowToCompanySettings(existing);
  }
  const created = await prisma.companyTaxSettings.create({
    data: {
      pisCofinsPercent: DEFAULT_PIS_COFINS_PERCENT,
      wholesaleLevel1ReductionPercent:
        DEFAULT_WHOLESALE_REDUCTIONS.level1ReductionPercent,
      wholesaleLevel2ReductionPercent:
        DEFAULT_WHOLESALE_REDUCTIONS.level2ReductionPercent,
      wholesaleLevel3ReductionPercent:
        DEFAULT_WHOLESALE_REDUCTIONS.level3ReductionPercent,
      wholesaleLevel1MinPurchaseUnit:
        DEFAULT_WHOLESALE_REDUCTIONS.level1MinPurchaseUnit,
      wholesaleLevel2MinPurchaseUnit:
        DEFAULT_WHOLESALE_REDUCTIONS.level2MinPurchaseUnit,
      wholesaleLevel3MinPurchaseUnit:
        DEFAULT_WHOLESALE_REDUCTIONS.level3MinPurchaseUnit,
    },
  });
  return rowToCompanySettings(created);
}

export async function getCompanyPisCofinsPercent(): Promise<number> {
  const settings = await getCompanySettings();
  return settings.pisCofinsPercent;
}

export async function ensureCompanyTaxSettings(): Promise<number> {
  const settings = await ensureCompanySettings();
  return settings.pisCofinsPercent;
}

export async function loadProductsMapBySku(
  skus: string[],
  aliasMap?: SkuAliasMap,
): Promise<Map<string, ResolvedProductPricing>> {
  const normalized = [
    ...new Set(skus.map((s) => normalizeProductSku(s)).filter(Boolean)),
  ];
  if (normalized.length === 0) return new Map();

  const map = aliasMap ?? (await loadSkuAliasMap());
  const canonicalSkus = [
    ...new Set(normalized.map((sku) => resolveCanonicalSku(sku, map))),
  ].filter(Boolean);

  const pisCofins = await getCompanyPisCofinsPercent();
  const products = await prisma.product.findMany({
    where: { sku: { in: canonicalSkus } },
  });

  const byCanonical = new Map<string, ResolvedProductPricing>();
  for (const product of products) {
    const record = productToPricingRecord(product);
    const resolved = resolveProductPricing(record, pisCofins);
    if (resolved) {
      byCanonical.set(product.sku, resolved);
    }
  }
  return indexBySkuWithAliases(byCanonical, normalized, map);
}

export async function loadStockReportProductsBySku(
  skus: string[],
): Promise<Record<string, StockReportProductInfo>> {
  const normalized = [
    ...new Set(skus.map((s) => normalizeProductSku(s)).filter(Boolean)),
  ];
  if (normalized.length === 0) return {};

  const aliasMap = await loadSkuAliasMap();
  const canonicalSkus = [
    ...new Set(normalized.map((sku) => resolveCanonicalSku(sku, aliasMap))),
  ].filter(Boolean);

  const products = await prisma.product.findMany({
    where: { sku: { in: canonicalSkus } },
    select: {
      sku: true,
      ncm: true,
      unitCostNf: true,
      purchaseIcmsPercent: true,
      hasIcmsSt: true,
      purchaseCostWithSt: true,
      ipiPercent: true,
    },
  });

  const byCanonical = new Map<string, StockReportProductInfo>();
  for (const product of products) {
    const unitCostNf = decimalToNumber(product.unitCostNf) ?? 0;
    const purchaseIcmsPercent = decimalToNumber(product.purchaseIcmsPercent) ?? 0;
    const purchaseCostWithSt = decimalToNumber(product.purchaseCostWithSt);
    const ipiPercent = decimalToNumber(product.ipiPercent) ?? 0;
    byCanonical.set(product.sku, {
      ncm: product.ncm,
      hasIcmsSt: product.hasIcmsSt,
      unitCost: stockReportUnitCostFromProduct({
        unitCostNf,
        purchaseIcmsPercent,
        hasIcmsSt: product.hasIcmsSt,
        purchaseCostWithSt,
        ipiPercent,
      }),
    });
  }

  const indexed = indexBySkuWithAliases(byCanonical, normalized, aliasMap);
  return Object.fromEntries(indexed.entries());
}

export type ProductWriteInput = {
  sku: string;
  ncm?: string | null;
  unitCostNf: number;
  purchaseIcmsPercent: number;
  hasIcmsSt: boolean;
  purchaseCostWithSt?: number | null;
  ipiPercent: number;
  extraCosts: number;
  isMonophasic: boolean;
  isImported: boolean;
  importContentPercent: number;
  saleIcmsPercent: number;
};

export function validateProductInput(
  input: ProductWriteInput,
): string | null {
  const sku = normalizeProductSku(input.sku);
  if (!sku) return "SKU é obrigatório";
  if (!Number.isFinite(input.unitCostNf) || input.unitCostNf < 0) {
    return "Custo unitário NF inválido";
  }
  if (
    !Number.isFinite(input.purchaseIcmsPercent) ||
    input.purchaseIcmsPercent < 0 ||
    input.purchaseIcmsPercent > 100
  ) {
    return "ICMS de compra inválido";
  }
  if (input.hasIcmsSt) {
    if (
      input.purchaseCostWithSt === null ||
      input.purchaseCostWithSt === undefined ||
      !Number.isFinite(input.purchaseCostWithSt) ||
      input.purchaseCostWithSt < 0
    ) {
      return "Informe o custo com ICMS-ST";
    }
  }
  if (!Number.isFinite(input.ipiPercent) || input.ipiPercent < 0) {
    return "IPI inválido";
  }
  if (!Number.isFinite(input.extraCosts) || input.extraCosts < 0) {
    return "Custos extras inválidos";
  }
  if (
    !Number.isFinite(input.importContentPercent) ||
    input.importContentPercent < 0 ||
    input.importContentPercent > 100
  ) {
    return "Conteúdo de importação inválido";
  }
  if (
    !Number.isFinite(input.saleIcmsPercent) ||
    input.saleIcmsPercent < 0 ||
    input.saleIcmsPercent > 100
  ) {
    return "ICMS de venda inválido";
  }
  return null;
}

export function productWriteToPrismaData(input: ProductWriteInput) {
  const sku = normalizeProductSku(input.sku);
  return {
    sku,
    ncm: input.ncm?.trim() || null,
    unitCostNf: input.unitCostNf,
    purchaseIcmsPercent: input.purchaseIcmsPercent,
    hasIcmsSt: input.hasIcmsSt,
    purchaseCostWithSt: input.hasIcmsSt ? input.purchaseCostWithSt : null,
    ipiPercent: input.ipiPercent,
    extraCosts: input.extraCosts,
    isMonophasic: input.isMonophasic,
    isImported: input.isImported,
    importContentPercent: input.isImported ? input.importContentPercent : 0,
    saleIcmsPercent: input.saleIcmsPercent,
  };
}
