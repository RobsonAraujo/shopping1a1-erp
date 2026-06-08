import { purchaseAnalysisConfig } from "@/config/purchase-analysis";
import { stockPlanningConfig } from "@/config/stock-planning";
import { computeStockPlanningDisplay } from "@/lib/stock-planning";

export type PurchasePerformanceTier = "alta" | "media" | "baixa" | "zero";

export type PurchaseStatus =
  | "urgente"
  | "planejar"
  | "ok"
  | "sem_vendas"
  | "evitar";

export type PurchaseRecommendation = "comprar" | "revisar" | "nao_repor";

export type PurchaseCostProfile = {
  lastPurchasePrice: number | null;
  minAcceptablePrice: number | null;
  targetCoverageDays: number | null;
};

export type PurchaseAnalysisInput = {
  unitsSoldInWindow: number;
  totalStock: number;
  purchaseLeadTimeDays: number;
  purchaseIsOverdue: boolean;
  needsPurchaseAttention: boolean;
  mlPrice?: number | null;
  costProfile?: PurchaseCostProfile | null;
};

export type PurchaseAnalysisResult = {
  performanceTier: PurchasePerformanceTier;
  performanceTooltip: string;
  purchaseStatus: PurchaseStatus;
  statusTooltip: string;
  recommendation: PurchaseRecommendation;
  suggestedQty: number;
  dailyAvg: number;
  coverageDays: number | null;
  unitsSoldInWindow: number;
  targetDays: number;
  grossMarginPct: number | null;
  worthBuying: boolean | null;
  recommendationTooltip: string;
};

function formatNumPt(n: number, maxFractionDigits = 2): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFractionDigits,
  });
}

export function computePerformanceTier(
  unitsSoldInWindow: number,
  dailyAvg: number,
): PurchasePerformanceTier {
  if (unitsSoldInWindow <= 0) return "zero";
  const { altaMin, mediaMin } = purchaseAnalysisConfig.rotationDailyAvg;
  if (dailyAvg >= altaMin) return "alta";
  if (dailyAvg >= mediaMin) return "media";
  return "baixa";
}

function buildPerformanceTooltip(
  tier: PurchasePerformanceTier,
  dailyAvg: number,
  unitsSoldInWindow: number,
  windowDays: number,
): string {
  const avgLabel = formatNumPt(dailyAvg);
  const base = `${unitsSoldInWindow} vendas em ${windowDays} dias (média ${avgLabel}/dia).`;
  switch (tier) {
    case "zero":
      return `Não vendeu no período. Classificação: Zero = sem vendas nos últimos ${windowDays} dias.`;
    case "alta":
      return `${base} Classificação: Alta = média ≥ 7 vendas/dia.`;
    case "media":
      return `${base} Classificação: Média = 3 a 6 vendas/dia.`;
    case "baixa":
      return `${base} Classificação: Baixa = 1 a 2 vendas/dia (ou menos de 1/dia quando houve alguma venda).`;
  }
}

function buildStatusTooltip(
  status: PurchaseStatus,
  input: {
    dailyAvg: number;
    unitsSoldInWindow: number;
    windowDays: number;
    purchaseLeadTimeDays: number;
    performanceTier: PurchasePerformanceTier;
    coverageDays: number | null;
    totalStock: number;
  },
): string {
  const leadFull = stockPlanningConfig.leadTimeDays;
  const purchaseLead = input.purchaseLeadTimeDays;
  switch (status) {
    case "urgente":
      return [
        "A data para iniciar a compra já passou.",
        `Com estoque de ${input.totalStock} un. e média de ${formatNumPt(input.dailyAvg)}/dia,`,
        `a compra deveria ter começado considerando prazo compra→galpão (${purchaseLead} d) + envio Full (${leadFull} d) antes do esgotamento previsto.`,
      ].join(" ");
    case "planejar":
      return [
        "Chegou o momento de planejar a reposição (data de compra é hoje ou já passou no calendário do dia),",
        "mas o atraso ainda não é crítico como em Urgente.",
        `Média atual: ${formatNumPt(input.dailyAvg)}/dia.`,
      ].join(" ");
    case "sem_vendas":
      return `Nenhuma venda nos últimos ${input.windowDays} dias — sem base para estimar reposição.`;
    case "evitar":
      return [
        `Rotação ${input.performanceTier === "baixa" ? "baixa" : "fraca"} (média ${formatNumPt(input.dailyAvg)}/dia).`,
        input.coverageDays !== null
          ? `Cobertura estimada de ${formatNumPt(input.coverageDays, 1)} dias — estoque pode durar demais para o ritmo de venda.`
          : "Pouca saída em relação ao estoque.",
        "Evitar repor até reavaliar demanda.",
      ].join(" ");
    case "ok":
      return [
        "Estoque e vendas dentro do esperado para o período.",
        `Média ${formatNumPt(input.dailyAvg)}/dia; nenhuma ação de compra necessária agora.`,
      ].join(" ");
  }
}

export function computeSuggestedPurchaseQty(
  unitsSoldInWindow: number,
  totalStock: number,
  purchaseLeadTimeDays: number,
  targetCoverageDaysOverride?: number | null,
): { suggestedQty: number; dailyAvg: number; targetDays: number } {
  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const dailyAvg =
    windowDays > 0 && unitsSoldInWindow > 0 ? unitsSoldInWindow / windowDays : 0;
  const targetDays =
    targetCoverageDaysOverride ??
    purchaseLeadTimeDays +
      stockPlanningConfig.leadTimeDays +
      purchaseAnalysisConfig.targetCoverageBufferDays;

  if (dailyAvg <= 0) {
    return { suggestedQty: 0, dailyAvg: 0, targetDays };
  }

  const needed = Math.ceil(dailyAvg * targetDays);
  const suggestedQty = Math.max(0, needed - totalStock);
  return { suggestedQty, dailyAvg, targetDays };
}

export function computePurchaseAnalysis(
  input: PurchaseAnalysisInput,
): PurchaseAnalysisResult {
  const windowDays = stockPlanningConfig.salesAverageWindowDays;
  const { suggestedQty, dailyAvg, targetDays } = computeSuggestedPurchaseQty(
    input.unitsSoldInWindow,
    input.totalStock,
    input.purchaseLeadTimeDays,
    input.costProfile?.targetCoverageDays,
  );

  const coverageDays =
    dailyAvg > 0 ? input.totalStock / dailyAvg : input.unitsSoldInWindow > 0 ? 0 : null;

  const performanceTier = computePerformanceTier(
    input.unitsSoldInWindow,
    dailyAvg,
  );
  const performanceTooltip = buildPerformanceTooltip(
    performanceTier,
    dailyAvg,
    input.unitsSoldInWindow,
    windowDays,
  );

  let purchaseStatus: PurchaseStatus = "ok";
  if (input.purchaseIsOverdue) {
    purchaseStatus = "urgente";
  } else if (input.unitsSoldInWindow <= 0) {
    purchaseStatus = "sem_vendas";
  } else if (performanceTier === "baixa") {
    purchaseStatus = "evitar";
  } else if (input.needsPurchaseAttention) {
    purchaseStatus = "planejar";
  }

  let recommendation: PurchaseRecommendation = "revisar";
  if (purchaseStatus === "urgente") {
    recommendation = suggestedQty > 0 ? "comprar" : "revisar";
  } else if (purchaseStatus === "sem_vendas" || purchaseStatus === "evitar") {
    recommendation = "nao_repor";
  } else if (
    purchaseStatus === "planejar" &&
    (performanceTier === "alta" || performanceTier === "media") &&
    suggestedQty > 0
  ) {
    recommendation = "comprar";
  } else if (purchaseStatus === "ok") {
    recommendation = "nao_repor";
  }

  const statusTooltip = buildStatusTooltip(purchaseStatus, {
    dailyAvg,
    unitsSoldInWindow: input.unitsSoldInWindow,
    windowDays,
    purchaseLeadTimeDays: input.purchaseLeadTimeDays,
    performanceTier,
    coverageDays,
    totalStock: input.totalStock,
  });

  let grossMarginPct: number | null = null;
  let worthBuying: boolean | null = null;
  const lastCost = input.costProfile?.lastPurchasePrice ?? null;
  const mlPrice = input.mlPrice ?? null;
  if (
    lastCost !== null &&
    lastCost > 0 &&
    mlPrice !== null &&
    mlPrice > 0
  ) {
    grossMarginPct = ((mlPrice - lastCost) / mlPrice) * 100;
    const minPrice = input.costProfile?.minAcceptablePrice ?? null;
    if (minPrice !== null && minPrice > 0) {
      worthBuying = lastCost <= minPrice;
      if (!worthBuying && recommendation === "comprar") {
        recommendation = "revisar";
      }
    }
  }

  const tooltipParts = [
    `Vendas: ${input.unitsSoldInWindow} un. em ${windowDays} dias (média ${formatNumPt(dailyAvg)}/dia).`,
    `Estoque total: ${input.totalStock} un.`,
    coverageDays !== null
      ? `Cobertura estimada: ${formatNumPt(coverageDays, 1)} dias.`
      : "Sem vendas no período — cobertura indeterminada.",
    `Meta de cobertura: ${targetDays} dias (prazo compra + Full + buffer).`,
    `Quantidade sugerida: max(0, ceil(média × meta) − estoque) = ${suggestedQty} un.`,
  ];
  if (grossMarginPct !== null) {
    tooltipParts.push(
      `Margem bruta estimada (preço ML − último custo): ${formatNumPt(grossMarginPct, 1)}%.`,
    );
  }
  if (worthBuying !== null) {
    tooltipParts.push(
      worthBuying
        ? "Último custo dentro do teto aceitável."
        : "Último custo acima do teto aceitável — revisar se ainda compensa.",
    );
  }

  return {
    performanceTier,
    performanceTooltip,
    purchaseStatus,
    statusTooltip,
    recommendation,
    suggestedQty,
    dailyAvg,
    coverageDays,
    unitsSoldInWindow: input.unitsSoldInWindow,
    targetDays,
    grossMarginPct,
    worthBuying,
    recommendationTooltip: tooltipParts.join(" "),
  };
}

export function buildPurchasePlan(
  totalStock: number,
  unitsSoldInWindow: number,
  purchaseLeadTimeDays: number,
) {
  return computeStockPlanningDisplay(
    totalStock,
    unitsSoldInWindow,
    stockPlanningConfig.salesAverageWindowDays,
    stockPlanningConfig,
    purchaseLeadTimeDays,
  );
}

export type PurchaseAnalysisSortKey = {
  purchaseIsOverdue: boolean;
  unitsSoldInWindow: number;
  suggestedQty: number;
};

export function comparePurchaseAnalysisRows(
  a: PurchaseAnalysisSortKey,
  b: PurchaseAnalysisSortKey,
): number {
  if (a.purchaseIsOverdue !== b.purchaseIsOverdue) {
    return a.purchaseIsOverdue ? -1 : 1;
  }
  if (b.unitsSoldInWindow !== a.unitsSoldInWindow) {
    return b.unitsSoldInWindow - a.unitsSoldInWindow;
  }
  return b.suggestedQty - a.suggestedQty;
}

export function supplierPathSegment(supplier: string): string {
  return encodeURIComponent(supplier);
}

export function decodeSupplierParam(param: string): string {
  return decodeURIComponent(param);
}
