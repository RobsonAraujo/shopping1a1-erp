import { skuImpostoOperacionalPercentual } from "@/lib/tax-report/imposto-operacional";
import { normalizeProductSku } from "@/lib/product-pricing";
import type { TaxReportPayload } from "@/lib/tax-report/types";

type SnapshotLoader = (sellerId: number) => Promise<TaxReportPayload | null>;

async function defaultLoadSnapshot(sellerId: number) {
  const { loadLatestTaxReportSnapshot } = await import(
    "@/lib/tax-report/service/generate-monthly-report"
  );
  return loadLatestTaxReportSnapshot(sellerId);
}

export type ProductTaxFromReport = {
  /** % médio operacional de imposto apurado por venda, vindo do relatório tributário. */
  taxPercent: number;
  /** Data (ISO) em que o snapshot usado foi gerado/recalculado. */
  generatedAt: string;
};

export type ProductTaxReportLookup = {
  generatedAt: string | null;
  bySku: Map<string, ProductTaxFromReport>;
};

/**
 * Carrega o último relatório tributário salvo e monta um mapa sku -> imposto
 * operacional médio (%), para preencher a coluna "Imposto" da tela de produtos.
 */
export async function loadProductTaxFromLatestReport(
  sellerId: number,
  loadSnapshot: SnapshotLoader = defaultLoadSnapshot,
): Promise<ProductTaxReportLookup> {
  const payload = await loadSnapshot(sellerId);
  if (!payload) {
    return { generatedAt: null, bySku: new Map() };
  }

  const generatedAt = payload.meta.geradoEm;
  const bySku = new Map<string, ProductTaxFromReport>();

  for (const row of payload.porSku) {
    const entry: ProductTaxFromReport = {
      taxPercent: skuImpostoOperacionalPercentual(row),
      generatedAt,
    };
    bySku.set(normalizeProductSku(row.sku), entry);
    for (const alias of row.skuAliases ?? []) {
      bySku.set(normalizeProductSku(alias), entry);
    }
  }

  return { generatedAt, bySku };
}
