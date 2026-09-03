import { prisma } from "@/lib/db";
import {
  DEFAULT_PIS_COFINS_PERCENT,
  normalizeProductSku,
  resolveProductPricing,
  type ProductRecordForPricing,
  type ResolvedProductPricing,
} from "@/lib/product-pricing";
import type { ProductTaxReportLookup } from "@/lib/product-tax-from-report";
import { loadProductResolverMaps, resolveProductForLine } from "@/lib/product-resolver";
import {
  DEFAULT_WHOLESALE_REDUCTIONS,
  WHOLESALE_ANCHOR_MIN_PURCHASE_UNIT,
  type WholesaleReductionSettings,
} from "@/lib/wholesale-pricing";
import {
  stockReportUnitCostFromProduct,
  type StockReportProductInfo,
} from "@/lib/inventory/inventory-stock-report";
import type { CompanyTaxSettings, Product } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import { toMlListingThumbnailUrl } from "@/lib/mercadolibre/item-image";

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
  mlItemId: string;
  /** Espelho de exibição do anúncio — pode ficar desatualizado, nunca é identidade. */
  sku: string | null;
  ncm: string | null;
  isImported: boolean;
  pricingCost: number | null;
  /** % médio operacional de imposto vindo do relatório tributário (null = sem dados para o SKU). */
  taxPercent: number | null;
  /** Data (ISO) em que o snapshot usado para taxPercent foi gerado/recalculado. */
  taxPercentGeneratedAt: string | null;
  /** Mês/ano do relatório tributário de onde veio taxPercent (pode ser um mês anterior ao mais recente). */
  taxPercentYear: number | null;
  taxPercentMonth: number | null;
  pmaPrice: number | null;
  createdAt: string;
  updatedAt: string;
  /** Thumbnail do anúncio ML (snapshot em `Listing.imageUrlSnapshot`) — null se nenhum anúncio com esse SKU foi sincronizado ainda. */
  imageUrl: string | null;
};

export function buildProductView(
  product: Product,
  pisCofinsPercent: number,
  taxFromReport?: ProductTaxReportLookup,
  companyTaxContext?: {
    taxRegime: CompanySettings["taxRegime"];
    simplesAliquotaEfetivaPercent: number | null;
  },
  imageUrl: string | null = null,
): ProductView {
  const record = productToPricingRecord(product);
  const resolved = resolveProductPricing(record, pisCofinsPercent);
  const isSimples = companyTaxContext?.taxRegime === "SIMPLES";
  const reportTax =
    taxFromReport?.byMlItemId.get(product.mlItemId) ??
    (product.sku
      ? taxFromReport?.bySku.get(normalizeProductSku(product.sku))
      : undefined);
  return {
    mlItemId: product.mlItemId,
    sku: product.sku,
    ncm: product.ncm,
    ...record,
    isImported: product.isImported,
    pricingCost: resolved?.pricingCost ?? null,
    taxPercent: isSimples
      ? (companyTaxContext?.simplesAliquotaEfetivaPercent ?? null)
      : (reportTax?.taxPercent ?? null),
    taxPercentGeneratedAt: isSimples ? null : (reportTax?.generatedAt ?? null),
    taxPercentYear: isSimples ? null : (reportTax?.year ?? null),
    taxPercentMonth: isSimples ? null : (reportTax?.month ?? null),
    pmaPrice: decimalToNumber(product.pmaPrice),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    imageUrl,
  };
}

/**
 * Uma imagem por SKU — a do anúncio sincronizado mais recentemente entre os
 * que compartilham esse `skuSnapshot`. Sem resolução de alias por ora (mesma
 * regra simples já usada no relatório de concorrência de catálogo).
 */
export async function loadListingImageUrlsBySku(
  organizationId: string,
  skus?: string[],
): Promise<Map<string, string>> {
  const normalized = skus
    ? [...new Set(skus.map((s) => s.trim()).filter(Boolean))]
    : undefined;
  if (normalized && normalized.length === 0) return new Map();

  const listings = await prisma.listing.findMany({
    where: {
      organizationId,
      ...(normalized ? { skuSnapshot: { in: normalized } } : {}),
      imageUrlSnapshot: { not: null },
    },
    select: { skuSnapshot: true, imageUrlSnapshot: true },
    orderBy: { lastSyncedAt: { sort: "desc", nulls: "last" } },
  });

  const bySku = new Map<string, string>();
  for (const listing of listings) {
    if (!listing.skuSnapshot || !listing.imageUrlSnapshot) continue;
    if (bySku.has(listing.skuSnapshot)) continue;
    bySku.set(listing.skuSnapshot, toMlListingThumbnailUrl(listing.imageUrlSnapshot));
  }
  return bySku;
}

export async function listingImageUrlForSku(
  organizationId: string,
  sku: string,
): Promise<string | null> {
  const bySku = await loadListingImageUrlsBySku(organizationId, [sku]);
  return bySku.get(sku) ?? null;
}

export type CompanySettings = {
  pisCofinsPercent: number;
  taxRegime: "LUCRO_REAL" | "LUCRO_PRESUMIDO" | "SIMPLES";
  simplesAliquotaEfetivaPercent: number | null;
} & WholesaleReductionSettings;

function rowToCompanySettings(row: CompanyTaxSettings): CompanySettings {
  const fromRates =
    (decimalToNumber(row.pisRatePercent) ?? 0) +
    (decimalToNumber(row.cofinsRatePercent) ?? 0);
  return {
    pisCofinsPercent:
      fromRates > 0
        ? fromRates
        : (decimalToNumber(row.pisCofinsPercent) ?? DEFAULT_PIS_COFINS_PERCENT),
    taxRegime: row.taxRegime as CompanySettings["taxRegime"],
    simplesAliquotaEfetivaPercent: decimalToNumber(row.simplesAliquotaEfetivaPercent),
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

export async function getCompanySettings(
  organizationId: string,
): Promise<CompanySettings> {
  const row = await prisma.companyTaxSettings.findUnique({
    where: { organizationId },
  });
  if (!row) {
    return {
      pisCofinsPercent: DEFAULT_PIS_COFINS_PERCENT,
      taxRegime: "LUCRO_REAL",
      simplesAliquotaEfetivaPercent: null,
      ...DEFAULT_WHOLESALE_REDUCTIONS,
    };
  }
  return rowToCompanySettings(row);
}

export async function ensureCompanySettings(
  organizationId: string,
): Promise<CompanySettings> {
  const existing = await prisma.companyTaxSettings.findUnique({
    where: { organizationId },
  });
  if (existing) {
    return rowToCompanySettings(existing);
  }
  const created = await prisma.companyTaxSettings.create({
    data: {
      organizationId,
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

export async function getCompanyPisCofinsPercent(
  organizationId: string,
): Promise<number> {
  const settings = await getCompanySettings(organizationId);
  return settings.pisCofinsPercent;
}

export type ProductPricingLookup = {
  /** Lookup por identidade (mlItemId) — preferir este; sku-texto não é mais único, `bySku` é só fallback pra linha sem itemId resolvido (ex.: componente de kit, que só tem sku). */
  byMlItemId: Map<string, ResolvedProductPricing>;
  bySku: Map<string, ResolvedProductPricing>;
};

/**
 * Indexa produtos já buscados por identidade (mlItemId, sempre 1:1) e por
 * sku-texto (fallback — `Product.sku` não é único, "primeiro que chega"
 * quando duas linhas colidem, igual a todo fallback por sku deste módulo).
 */
export function indexProductPricingLookup(
  products: Product[],
  pisCofins: number,
): ProductPricingLookup {
  const byMlItemId = new Map<string, ResolvedProductPricing>();
  const bySku = new Map<string, ResolvedProductPricing>();
  for (const product of products) {
    const record = productToPricingRecord(product);
    const resolved = resolveProductPricing(record, pisCofins);
    if (!resolved) continue;
    byMlItemId.set(product.mlItemId, resolved);
    if (product.sku && !bySku.has(product.sku)) {
      bySku.set(product.sku, resolved);
    }
  }
  return { byMlItemId, bySku };
}

export async function loadProductsMapBySku(
  organizationId: string,
  skus: string[],
  mlItemIds: string[] = [],
): Promise<ProductPricingLookup> {
  const normalized = [
    ...new Set(skus.map((s) => normalizeProductSku(s)).filter(Boolean)),
  ];
  const uniqueMlItemIds = [...new Set(mlItemIds.filter(Boolean))];
  if (normalized.length === 0 && uniqueMlItemIds.length === 0) {
    return { byMlItemId: new Map(), bySku: new Map() };
  }

  const pisCofins = await getCompanyPisCofinsPercent(organizationId);
  const products = await prisma.product.findMany({
    where: {
      organizationId,
      OR: [
        ...(normalized.length > 0 ? [{ sku: { in: normalized } }] : []),
        ...(uniqueMlItemIds.length > 0
          ? [{ mlItemId: { in: uniqueMlItemIds } }]
          : []),
      ],
    },
  });

  return indexProductPricingLookup(products, pisCofins);
}

function productToStockReportInfo(product: {
  ncm: string | null;
  unitCostNf: unknown;
  purchaseIcmsPercent: unknown;
  hasIcmsSt: boolean;
  purchaseCostWithSt: unknown;
  ipiPercent: unknown;
}): StockReportProductInfo {
  const unitCostNf = decimalToNumber(product.unitCostNf) ?? 0;
  const purchaseIcmsPercent = decimalToNumber(product.purchaseIcmsPercent) ?? 0;
  const purchaseCostWithSt = decimalToNumber(product.purchaseCostWithSt);
  const ipiPercent = decimalToNumber(product.ipiPercent) ?? 0;
  return {
    ncm: product.ncm,
    hasIcmsSt: product.hasIcmsSt,
    unitCost: stockReportUnitCostFromProduct({
      unitCostNf,
      purchaseIcmsPercent,
      hasIcmsSt: product.hasIcmsSt,
      purchaseCostWithSt,
      ipiPercent,
    }),
  };
}

/**
 * Record por SKU (do anúncio ao vivo) — contrato usado pelo relatório de
 * Estoque, que agrupa fisicamente por texto de SKU (inclusive "merge
 * groups" manuais entre SKUs divergentes). Resolve o Product pelo
 * `mlItemId` direto (identidade real); o SKU aqui é só a chave de saída
 * pro relatório, não influencia a resolução.
 */
export async function loadStockReportProductsForListings(
  organizationId: string,
  lines: { mlItemId: string; sku: string | null }[],
): Promise<Record<string, StockReportProductInfo>> {
  if (lines.length === 0) return {};
  const maps = await loadProductResolverMaps(
    organizationId,
    lines.map((l) => ({ itemId: l.mlItemId })),
  );

  const result: Record<string, StockReportProductInfo> = {};
  for (const line of lines) {
    const normalizedSku = line.sku ? normalizeProductSku(line.sku) : "";
    if (!normalizedSku || result[normalizedSku]) continue;
    const resolution = resolveProductForLine({ itemId: line.mlItemId }, maps);
    if (!resolution.product) continue;
    result[normalizedSku] = productToStockReportInfo(resolution.product);
  }
  return result;
}

/**
 * Mesma resolução de custo que `loadStockReportProductsForListings`, mas
 * indexada por `mlItemId` (1:1 real) em vez de texto de SKU — pra
 * consumidores como Insights, onde cada anúncio precisa do seu próprio
 * custo mesmo que dois anúncios compartilhem o mesmo texto de SKU exibido
 * (`Product.sku` não é único). Não usar pro relatório de Estoque, que
 * agrupa fisicamente por SKU de propósito (merge groups) — essa função não
 * substitui `loadStockReportProductsForListings`, é uma variante paralela.
 */
export async function loadStockReportProductsByMlItemId(
  organizationId: string,
  mlItemIds: string[],
): Promise<Map<string, StockReportProductInfo>> {
  const uniqueIds = [...new Set(mlItemIds)];
  if (uniqueIds.length === 0) return new Map();
  const maps = await loadProductResolverMaps(
    organizationId,
    uniqueIds.map((itemId) => ({ itemId })),
  );

  const result = new Map<string, StockReportProductInfo>();
  for (const itemId of uniqueIds) {
    const resolution = resolveProductForLine({ itemId }, maps);
    if (!resolution.product) continue;
    result.set(itemId, productToStockReportInfo(resolution.product));
  }
  return result;
}

export type ProductWriteInput = {
  mlItemId: string;
  sku: string;
  ncm?: string | null;
  unitCostNf: number;
  /** Campos fiscais de Lucro Real — opcionais: omitidos numa edição preservam o
   * valor já gravado (empresa Simples Nacional não os expõe no formulário). */
  purchaseIcmsPercent?: number;
  hasIcmsSt?: boolean;
  purchaseCostWithSt?: number | null;
  ipiPercent?: number;
  extraCosts: number;
  isMonophasic?: boolean;
  isImported?: boolean;
  saleIcmsPercent?: number;
  pmaPrice?: number | null;
};

export function validateProductInput(
  input: ProductWriteInput,
): string | null {
  if (!input.mlItemId?.trim()) return "Selecione um anúncio do Mercado Livre";
  if (!Number.isFinite(input.unitCostNf) || input.unitCostNf < 0) {
    return "Custo unitário NF inválido";
  }
  if (input.purchaseIcmsPercent !== undefined) {
    if (
      !Number.isFinite(input.purchaseIcmsPercent) ||
      input.purchaseIcmsPercent < 0 ||
      input.purchaseIcmsPercent > 100
    ) {
      return "ICMS de compra inválido";
    }
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
  if (input.ipiPercent !== undefined) {
    if (!Number.isFinite(input.ipiPercent) || input.ipiPercent < 0) {
      return "IPI inválido";
    }
  }
  if (!Number.isFinite(input.extraCosts) || input.extraCosts < 0) {
    return "Custos extras inválidos";
  }
  if (input.saleIcmsPercent !== undefined) {
    if (
      !Number.isFinite(input.saleIcmsPercent) ||
      input.saleIcmsPercent < 0 ||
      input.saleIcmsPercent > 100
    ) {
      return "ICMS de venda inválido";
    }
  }
  if (
    input.pmaPrice !== null &&
    input.pmaPrice !== undefined &&
    (!Number.isFinite(input.pmaPrice) || input.pmaPrice <= 0)
  ) {
    return "PMA inválido";
  }
  return null;
}

/** Para criação (POST) — campo omitido vira 0/false explícito no registro novo. */
export function productWriteToPrismaData(
  organizationId: string,
  input: ProductWriteInput,
) {
  const sku = normalizeProductSku(input.sku) || null;
  const hasIcmsSt = input.hasIcmsSt ?? false;
  return {
    mlItemId: input.mlItemId,
    organizationId,
    sku,
    ncm: input.ncm?.trim() || null,
    unitCostNf: input.unitCostNf,
    purchaseIcmsPercent: input.purchaseIcmsPercent ?? 0,
    hasIcmsSt,
    purchaseCostWithSt: hasIcmsSt ? (input.purchaseCostWithSt ?? null) : null,
    ipiPercent: input.ipiPercent ?? 0,
    extraCosts: input.extraCosts,
    isMonophasic: input.isMonophasic ?? false,
    isImported: input.isImported ?? false,
    saleIcmsPercent: input.saleIcmsPercent ?? 0,
    pmaPrice: input.pmaPrice ?? null,
  };
}

/**
 * Para edição (PATCH) — campo omitido não entra no objeto `data`, então o
 * Prisma não toca a coluna e o valor já gravado é preservado (ex.: empresa
 * migrou de Lucro Real para Simples Nacional e não reenvia mais esses campos).
 */
export function productPatchToPrismaData(
  input: ProductWriteInput,
): Prisma.ProductUpdateInput {
  const data: Prisma.ProductUpdateInput = {
    unitCostNf: input.unitCostNf,
    extraCosts: input.extraCosts,
  };
  if (input.ncm !== undefined) data.ncm = input.ncm?.trim() || null;
  if (input.purchaseIcmsPercent !== undefined) {
    data.purchaseIcmsPercent = input.purchaseIcmsPercent;
  }
  if (input.hasIcmsSt !== undefined) {
    data.hasIcmsSt = input.hasIcmsSt;
    data.purchaseCostWithSt = input.hasIcmsSt ? (input.purchaseCostWithSt ?? null) : null;
  }
  if (input.ipiPercent !== undefined) data.ipiPercent = input.ipiPercent;
  if (input.isMonophasic !== undefined) data.isMonophasic = input.isMonophasic;
  if (input.isImported !== undefined) data.isImported = input.isImported;
  if (input.saleIcmsPercent !== undefined) data.saleIcmsPercent = input.saleIcmsPercent;
  if (input.pmaPrice !== undefined) data.pmaPrice = input.pmaPrice ?? null;
  return data;
}

/**
 * Campos do produto cobertos pelo nivelamento de custo do DRE (todos exceto
 * NCM, que é classificação fiscal fixa e não varia no tempo).
 */
export type LevelableProductValues = {
  hasIcmsSt: boolean;
  unitCostNf: number;
  purchaseCostWithSt: number | null;
  ipiPercent: number;
  purchaseIcmsPercent: number;
  extraCosts: number;
  isMonophasic: boolean;
  saleIcmsPercent: number;
  isImported: boolean;
  pmaPrice: number | null;
};

export type LevelableProductFieldKey = keyof LevelableProductValues;

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.000_001;
}

function toLevelableValues(product: Product): LevelableProductValues {
  return {
    hasIcmsSt: product.hasIcmsSt,
    unitCostNf: decimalToNumber(product.unitCostNf) ?? 0,
    purchaseCostWithSt: decimalToNumber(product.purchaseCostWithSt),
    ipiPercent: decimalToNumber(product.ipiPercent) ?? 0,
    purchaseIcmsPercent: decimalToNumber(product.purchaseIcmsPercent) ?? 0,
    extraCosts: decimalToNumber(product.extraCosts) ?? 0,
    isMonophasic: product.isMonophasic,
    saleIcmsPercent: decimalToNumber(product.saleIcmsPercent) ?? 0,
    isImported: product.isImported,
    pmaPrice: decimalToNumber(product.pmaPrice),
  };
}

/**
 * Compara o estado anterior do produto (antes do PATCH) com a edição
 * validada e retorna quais campos niveláveis mudaram de fato — só os que
 * vieram no payload (regime Simples Nacional omite os fiscais de Lucro
 * Real; omitido = preservado no banco, não é "mudança"). `previousValues`
 * traz o snapshot completo de antes (não só os campos que mudaram), pra
 * pré-preencher um nivelamento cobrindo o período anterior à edição.
 */
export function diffLevelableProductFields(
  before: Product,
  input: ProductWriteInput,
): {
  changedFields: LevelableProductFieldKey[];
  previousValues: LevelableProductValues;
} {
  const previousValues = toLevelableValues(before);
  const changedFields: LevelableProductFieldKey[] = [];

  if (!amountsMatch(input.unitCostNf, previousValues.unitCostNf)) {
    changedFields.push("unitCostNf");
  }
  if (!amountsMatch(input.extraCosts, previousValues.extraCosts)) {
    changedFields.push("extraCosts");
  }
  if (
    input.purchaseIcmsPercent !== undefined &&
    !amountsMatch(input.purchaseIcmsPercent, previousValues.purchaseIcmsPercent)
  ) {
    changedFields.push("purchaseIcmsPercent");
  }
  // hasIcmsSt/purchaseCostWithSt sempre andam juntos — mesma convenção de
  // `productPatchToPrismaData` (purchaseCostWithSt só é gravado quando
  // hasIcmsSt vem no payload).
  if (input.hasIcmsSt !== undefined) {
    const nextPurchaseCostWithSt = input.hasIcmsSt
      ? (input.purchaseCostWithSt ?? null)
      : null;
    if (input.hasIcmsSt !== previousValues.hasIcmsSt) {
      changedFields.push("hasIcmsSt");
    }
    const costChanged =
      nextPurchaseCostWithSt === null || previousValues.purchaseCostWithSt === null
        ? nextPurchaseCostWithSt !== previousValues.purchaseCostWithSt
        : !amountsMatch(nextPurchaseCostWithSt, previousValues.purchaseCostWithSt);
    if (costChanged) changedFields.push("purchaseCostWithSt");
  }
  if (
    input.ipiPercent !== undefined &&
    !amountsMatch(input.ipiPercent, previousValues.ipiPercent)
  ) {
    changedFields.push("ipiPercent");
  }
  if (
    input.isMonophasic !== undefined &&
    input.isMonophasic !== previousValues.isMonophasic
  ) {
    changedFields.push("isMonophasic");
  }
  if (
    input.isImported !== undefined &&
    input.isImported !== previousValues.isImported
  ) {
    changedFields.push("isImported");
  }
  if (
    input.saleIcmsPercent !== undefined &&
    !amountsMatch(input.saleIcmsPercent, previousValues.saleIcmsPercent)
  ) {
    changedFields.push("saleIcmsPercent");
  }
  if (input.pmaPrice !== undefined) {
    const nextPma = input.pmaPrice ?? null;
    const pmaChanged =
      nextPma === null || previousValues.pmaPrice === null
        ? nextPma !== previousValues.pmaPrice
        : !amountsMatch(nextPma, previousValues.pmaPrice);
    if (pmaChanged) changedFields.push("pmaPrice");
  }

  return { changedFields, previousValues };
}
