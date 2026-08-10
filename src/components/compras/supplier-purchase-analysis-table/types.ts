import type { PurchaseAnalysisItemRow } from "@/lib/purchase-analysis-rows";
import type {
  PurchasePerformanceTier,
  PurchaseRecommendation,
  PurchaseStatus,
} from "@/lib/purchase-analysis";

export type SupplierPurchaseAnalysisTableProps = {
  rows: PurchaseAnalysisItemRow[];
  emptyMessage?: string;
};

export const performanceLabels: Record<PurchasePerformanceTier, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
  zero: "Zero",
};

export const performanceVariants: Record<
  PurchasePerformanceTier,
  "success" | "secondary" | "warning" | "muted"
> = {
  alta: "success",
  media: "secondary",
  baixa: "warning",
  zero: "muted",
};

export const statusLabels: Record<PurchaseStatus, string> = {
  urgente: "Urgente",
  planejar: "Planejar",
  ok: "OK",
  sem_vendas: "Sem vendas",
  evitar: "Evitar",
};

export const statusVariants: Record<
  PurchaseStatus,
  "overdue" | "warning" | "success" | "muted" | "secondary"
> = {
  urgente: "overdue",
  planejar: "warning",
  ok: "success",
  sem_vendas: "muted",
  evitar: "secondary",
};

export const recommendationLabels: Record<PurchaseRecommendation, string> = {
  comprar: "Comprar",
  revisar: "Revisar",
  nao_repor: "Não repor",
};

export function formatCoverage(days: number | null): string {
  if (days === null) return "—";
  if (days < 1) return "< 1 dia";
  const floored = Math.floor(days);
  return `${floored} ${floored === 1 ? "dia" : "dias"}`;
}

export function catalogStatusLabel(status: string | null): string | null {
  if (!status) return null;
  if (status === "winning") return "Ganhando";
  if (status === "losing") return "Perdendo";
  if (status === "shared") return "Compartilhado";
  return "Desconhecido";
}

export function catalogReportHref(itemId: string) {
  return `/dashboard/catalog-report/${itemId}`;
}

export function showCatalogReportLink(row: PurchaseAnalysisItemRow): boolean {
  return row.item.catalog_listing === true || row.catalogStatus !== null;
}
