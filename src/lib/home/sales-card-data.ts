import type { UserMe } from "@/lib/mercadolibre/types";

export type DashboardSalesSnapshot = {
  completed: number;
  /** 0–100. Fração `ratings.positive` da reputação ML (avaliações positivas). */
  satisfactionPercent: number | null;
};

export function buildDashboardSalesSnapshot(
  me: UserMe | null,
): DashboardSalesSnapshot | null {
  const completed = me?.seller_reputation?.transactions?.completed;
  if (completed == null) return null;

  // ML manda 0–1: fatia das avaliações positivas entre quem avaliou a compra.
  const positiveRatio = me?.seller_reputation?.transactions?.ratings?.positive;
  const satisfactionPercent =
    positiveRatio != null ? Math.round(positiveRatio * 100) : null;

  return { completed, satisfactionPercent };
}
