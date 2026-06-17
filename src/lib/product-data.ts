import { prisma } from "@/lib/db";
import {
  DEFAULT_PIS_COFINS_PERCENT,
  normalizeProductSku,
  resolveProductPricing,
  type ProductRecordForPricing,
  type ResolvedProductPricing,
} from "@/lib/product-pricing";
import type { Product } from "@/generated/prisma/client";

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
  pricingCost: number | null;
  taxPercent: number | null;
  createdAt: string;
  updatedAt: string;
};

export function buildProductView(
  product: Product,
  pisCofinsPercent: number,
): ProductView {
  const record = productToPricingRecord(product);
  const resolved = resolveProductPricing(record, pisCofinsPercent);
  return {
    sku: product.sku,
    ncm: product.ncm,
    ...record,
    pricingCost: resolved?.pricingCost ?? null,
    taxPercent: resolved?.taxPercent ?? null,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export async function getCompanyPisCofinsPercent(): Promise<number> {
  const row = await prisma.companyTaxSettings.findUnique({
    where: { id: "default" },
  });
  if (!row) return DEFAULT_PIS_COFINS_PERCENT;
  return decimalToNumber(row.pisCofinsPercent) ?? DEFAULT_PIS_COFINS_PERCENT;
}

export async function ensureCompanyTaxSettings(): Promise<number> {
  const existing = await prisma.companyTaxSettings.findUnique({
    where: { id: "default" },
  });
  if (existing) {
    return decimalToNumber(existing.pisCofinsPercent) ?? DEFAULT_PIS_COFINS_PERCENT;
  }
  const created = await prisma.companyTaxSettings.create({
    data: { pisCofinsPercent: DEFAULT_PIS_COFINS_PERCENT },
  });
  return decimalToNumber(created.pisCofinsPercent) ?? DEFAULT_PIS_COFINS_PERCENT;
}

export async function resolvePricingForSku(
  sku: string | null | undefined,
): Promise<{
  sku: string | null;
  pricing: ResolvedProductPricing | null;
  product: ProductView | null;
}> {
  const normalized = sku ? normalizeProductSku(sku) : "";
  if (!normalized) {
    return { sku: null, pricing: null, product: null };
  }

  const pisCofins = await getCompanyPisCofinsPercent();
  const product = await prisma.product.findUnique({
    where: { sku: normalized },
  });
  if (!product) {
    return { sku: normalized, pricing: null, product: null };
  }

  const view = buildProductView(product, pisCofins);
  if (view.pricingCost === null || view.taxPercent === null) {
    return { sku: normalized, pricing: null, product: view };
  }

  return {
    sku: normalized,
    pricing: {
      pricingCost: view.pricingCost,
      taxPercent: view.taxPercent,
      extraCosts: view.extraCosts,
    },
    product: view,
  };
}

export async function loadProductsMapBySku(
  skus: string[],
): Promise<Map<string, ResolvedProductPricing>> {
  const normalized = [
    ...new Set(skus.map((s) => normalizeProductSku(s)).filter(Boolean)),
  ];
  if (normalized.length === 0) return new Map();

  const pisCofins = await getCompanyPisCofinsPercent();
  const products = await prisma.product.findMany({
    where: { sku: { in: normalized } },
  });

  const map = new Map<string, ResolvedProductPricing>();
  for (const product of products) {
    const record = productToPricingRecord(product);
    const resolved = resolveProductPricing(record, pisCofins);
    if (resolved) {
      map.set(product.sku, resolved);
    }
  }
  return map;
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
    saleIcmsPercent: input.saleIcmsPercent,
  };
}
