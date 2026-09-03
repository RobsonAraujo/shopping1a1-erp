/**
 * Contrato tipado dos insights: cada tipo importa Pick<> dos tipos canônicos.
 * Se um campo for renomeado na fonte, TypeScript quebra o build aqui — não no runtime.
 */
import type { SkuAggregation } from "@/lib/tax-report/types";
import type { FinancialEvaluationRow } from "@/lib/lucratividade/financial-evaluation-data";
import type { PurchaseAnalysisItemRow } from "@/lib/compras/purchase-analysis-rows";

// ---------------------------------------------------------------------------
// Slow movers — produtos com cobertura acima do threshold configurável
// ---------------------------------------------------------------------------

export type SlowMoverRow = Pick<
  PurchaseAnalysisItemRow,
  "sku" | "totalStock" | "purchaseLeadTimeDays"
> & {
  mlItemId: string;
  title: string;
  imageUrl: string | null;
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

export type ParetoCurve = "A" | "B" | "C";

export type ParetoRow = Pick<
  SkuAggregation,
  "sku" | "receitaTotal" | "unidadesVendidas" | "impostoTotal"
> & {
  receitaPercent: number;
  receitaAcumuladaPercent: number;
  /** Curva ABC: A = até 80% acumulado, B = até 95%, C = restante. */
  curve: ParetoCurve;
};

// ---------------------------------------------------------------------------
// Potencial de faturamento — estimativa sem ruptura de estoque
// ---------------------------------------------------------------------------

export type RevenuePotentialRow = {
  mlItemId: string;
  title: string;
  sku: string | null;
  status: string;
  imageUrl: string | null;
  price: number;
  dailyAvgEstimate: number;
  potentialMonthlyRevenue: number;
  currentMonthlyRevenue: number;
  gap: number;
  /** "recent": vendendo normalmente agora. "historical": ancorado em venda passada (pausado ou em ruptura). */
  estimateBasis: "recent" | "historical";
  /** Custo unitário cadastrado em "Meus produtos" (NF ou compra+ST); null se não cadastrado. */
  unitCost: number | null;
  hasIcmsSt: boolean;
};

// ---------------------------------------------------------------------------
// Capital de giro — estoque necessário para N dias de vendas (produtos ativos)
// ---------------------------------------------------------------------------

export type WorkingCapitalRow = {
  mlItemId: string;
  sku: string | null;
  title: string;
  supplier: string;
  dailyAvg: number;
  periodDays: number;
  unitsNeeded: number;
  unitCost: number;
  hasIcmsSt: boolean;
  grossCapital: number;
  installments: number;
  effectiveCapital: number;
};

// ---------------------------------------------------------------------------
// Simulações salvas (potencial de faturamento + capital de giro)
// ---------------------------------------------------------------------------

export type RevenueSimulationPayload = {
  overrides: Record<string, number>;
  excluded: Record<string, boolean>;
  periodDays: number;
  installmentsBySupplier: Record<string, number>;
};
