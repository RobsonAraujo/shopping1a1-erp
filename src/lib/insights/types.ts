/**
 * Tipos do Potencial de faturamento e do Capital de giro.
 */

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
  /** Nome do fornecedor cadastrado em "Meus produtos"; null se o produto não
   * tem fornecedor vinculado (cai no fallback por SKU, `getSkuSupplier`). */
  supplierName: string | null;
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
