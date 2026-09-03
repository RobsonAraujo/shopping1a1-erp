import {
  computeEffectivePricingCost,
  normalizeProductSku,
  type ResolvedProductPricing,
} from "@/lib/pricing/product-pricing";

export type DreProductCostLevelingInput = {
  sku: string;
  /** YYYY-MM-DD (inclusivo). */
  startDate: string;
  /** YYYY-MM-DD (inclusivo). */
  endDate: string;
  hasIcmsSt: boolean;
  unitCostNf: number;
  purchaseCostWithSt: number | null;
  ipiPercent: number;
  /**
   * Histórico completo do cadastro do produto (exceto NCM, fixo no tempo).
   * Não entram no cálculo do DRE hoje — só persistidos/exibidos.
   */
  purchaseIcmsPercent: number | null;
  extraCosts: number | null;
  isMonophasic: boolean | null;
  saleIcmsPercent: number | null;
  isImported: boolean | null;
  pmaPrice: number | null;
};

export type DreProductCostLevelingView = DreProductCostLevelingInput & {
  id: string;
  pricingCost: number;
  createdAt: string;
  updatedAt: string;
};

export type DreProductCostLevelingPricing = {
  sku: string;
  startDate: string;
  endDate: string;
  pricingCost: number;
};

export class DreProductCostLevelingError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_period"
      | "invalid_cost"
      | "sku_not_found"
      | "overlap"
      | "not_found",
  ) {
    super(message);
    this.name = "DreProductCostLevelingError";
  }
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidYmd(ymd: string): boolean {
  const match = YMD_RE.exec(ymd.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function isValidDatePeriod(startDate: string, endDate: string): boolean {
  return (
    isValidYmd(startDate) &&
    isValidYmd(endDate) &&
    startDate <= endDate
  );
}

export function dateRangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function ymdFromDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function civilMonthBounds(
  year: number,
  month: number,
): { startDate: string; endDate: string } {
  const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = new Date(year, month, 0);
  return { startDate, endDate: ymdFromDate(end) };
}

export function dateRangeOverlapsMonth(
  startDate: string,
  endDate: string,
  year: number,
  month: number,
): boolean {
  if (!isValidDatePeriod(startDate, endDate)) return false;
  const monthBounds = civilMonthBounds(year, month);
  return dateRangesOverlap({ startDate, endDate }, monthBounds);
}

/** Meses civis que intersectam o intervalo de datas (para CTA de re-sync). */
export function enumerateMonthsOverlappingDateRange(
  startDate: string,
  endDate: string,
): Array<{ year: number; month: number }> {
  if (!isValidDatePeriod(startDate, endDate)) return [];
  const startMatch = YMD_RE.exec(startDate)!;
  const endMatch = YMD_RE.exec(endDate)!;
  let year = Number(startMatch[1]);
  let month = Number(startMatch[2]);
  const endYear = Number(endMatch[1]);
  const endMonth = Number(endMatch[2]);
  const out: Array<{ year: number; month: number }> = [];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    out.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}

/**
 * Custo efetivo do nivelamento (mesma fórmula do cadastro de produtos).
 * `purchaseIcmsPercent` não entra na fórmula do custo — passa 0 só para o tipo.
 */
export function computeLevelingPricingCost(input: {
  hasIcmsSt: boolean;
  unitCostNf: number;
  purchaseCostWithSt: number | null;
  ipiPercent: number;
}): number | null {
  return computeEffectivePricingCost({
    unitCostNf: input.unitCostNf,
    purchaseIcmsPercent: 0,
    hasIcmsSt: input.hasIcmsSt,
    purchaseCostWithSt: input.purchaseCostWithSt,
    ipiPercent: input.ipiPercent,
    isMonophasic: false,
    pisCofinsPercent: 0,
  });
}

/** Resolve custo nivelado para um SKU na data do pedido (ou no mês, se a data faltar). */
export function resolveLevelingCostForOrderDate(
  levelings: DreProductCostLevelingPricing[],
  sku: string,
  orderDateYmd: string | null,
  year: number,
  month: number,
): number | null {
  const key = normalizeProductSku(sku);
  const forSku = levelings.filter((row) => row.sku === key);
  if (forSku.length === 0) return null;

  if (orderDateYmd && isValidYmd(orderDateYmd)) {
    const hit = forSku.find(
      (row) => orderDateYmd >= row.startDate && orderDateYmd <= row.endDate,
    );
    return hit?.pricingCost ?? null;
  }

  const monthBounds = civilMonthBounds(year, month);
  const hit = forSku.find((row) =>
    dateRangesOverlap(row, monthBounds),
  );
  return hit?.pricingCost ?? null;
}

/**
 * Monta um mapa de pricing com overrides de nivelamento para a data do pedido.
 * Retorna os SKUs que foram sobrescritos.
 */
export function applyLevelingsForOrderDate(
  pricingBySku: Map<string, ResolvedProductPricing>,
  levelings: DreProductCostLevelingPricing[],
  orderDateYmd: string | null,
  year: number,
  month: number,
): { pricing: Map<string, ResolvedProductPricing>; leveledSkus: Set<string> } {
  const pricing = new Map(pricingBySku);
  const leveledSkus = new Set<string>();
  const skus = new Set(levelings.map((row) => row.sku));

  for (const sku of skus) {
    const cost = resolveLevelingCostForOrderDate(
      levelings,
      sku,
      orderDateYmd,
      year,
      month,
    );
    if (cost === null) continue;
    const existing = pricing.get(sku);
    if (existing) {
      pricing.set(sku, { ...existing, pricingCost: cost });
    } else {
      pricing.set(sku, { pricingCost: cost, taxPercent: 0, extraCosts: 0 });
    }
    leveledSkus.add(sku);
  }

  return { pricing, leveledSkus };
}

/** @deprecated use applyLevelingsForOrderDate — mantido para testes de mapa simples. */
export function applyLevelingPricingToMap(
  pricingBySku: Map<string, ResolvedProductPricing>,
  levelingBySku: Map<string, number>,
): Set<string> {
  const leveled = new Set<string>();
  for (const [sku, pricingCost] of levelingBySku) {
    const key = normalizeProductSku(sku);
    const existing = pricingBySku.get(key);
    if (existing) {
      pricingBySku.set(key, { ...existing, pricingCost });
    } else {
      pricingBySku.set(key, {
        pricingCost,
        taxPercent: 0,
        extraCosts: 0,
      });
    }
    leveled.add(key);
  }
  return leveled;
}
