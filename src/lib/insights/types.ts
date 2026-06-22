/**
 * Contrato tipado dos insights: cada tipo importa Pick<> dos tipos canônicos.
 * Se um campo for renomeado na fonte, TypeScript quebra o build aqui — não no runtime.
 */
import type { SkuAggregation } from "@/lib/tax-report/types";
import type { FinancialEvaluationRow } from "@/lib/financial-evaluation-data";
import type { PurchaseAnalysisItemRow } from "@/lib/purchase-analysis-rows";

// ---------------------------------------------------------------------------
// Slow movers — produtos com cobertura acima do threshold configurável
// ---------------------------------------------------------------------------

export type SlowMoverRow = Pick<
  PurchaseAnalysisItemRow,
  "sku" | "totalStock" | "purchaseLeadTimeDays"
> & {
  mlItemId: string;
  title: string;
  coverageDays: number | null;
  dailyAvg: number;
  unitsSoldInWindow: number;
  performanceTier: PurchaseAnalysisItemRow["analysis"]["performanceTier"];
  catalogListing: boolean;
};

// ---------------------------------------------------------------------------
// Ruptura iminente — produtos onde coverageDays < purchaseLeadTimeDays
// ---------------------------------------------------------------------------

export type RupturaRow = SlowMoverRow;

// ---------------------------------------------------------------------------
// Ads × Margem — produtos onde ads consomem mais do que a margem suporta
// ---------------------------------------------------------------------------

export type AdsMargem = Pick<
  FinancialEvaluationRow,
  | "mlItemId"
  | "title"
  | "sku"
  | "tacosPercent"
  | "marginAfterAdsPercent"
  | "marginAfterAdsValue"
  | "hasActiveAds"
  | "salePrice"
> & {
  baseMarginPercent: number | null;
};

// ---------------------------------------------------------------------------
// Mapa DIFAL — margem média por estado de destino
// ---------------------------------------------------------------------------

export type DifalMapRow = {
  uf: string;
  receitaTotal: number;
  unidades: number;
  margemMedia: number;
  totalTransacoes: number;
};

// ---------------------------------------------------------------------------
// Pareto de receita — concentração de receita por SKU
// ---------------------------------------------------------------------------

export type ParetoRow = Pick<
  SkuAggregation,
  "sku" | "receitaTotal" | "unidadesVendidas" | "impostoTotal"
> & {
  receitaPercent: number;
  receitaAcumuladaPercent: number;
};
