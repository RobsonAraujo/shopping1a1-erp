import { TrendingUp } from "lucide-react";
import { DashboardKpiCard } from "@/components/home/DashboardKpiCard";
import { CATEGORY_BADGE_CLASS } from "@/lib/ui/tone";
import type { DashboardSalesSnapshot } from "@/lib/home/sales-card-data";

const POSITIVE_RATINGS_LABEL = "Avaliações positivas";
const POSITIVE_RATINGS_HINT =
  "Dos compradores que avaliaram a compra no Mercado Livre";

export function DashboardSalesCard({
  snapshot,
  pending = false,
}: {
  snapshot?: DashboardSalesSnapshot | null;
  pending?: boolean;
}) {
  const fillPercent = snapshot?.satisfactionPercent ?? null;

  return (
    <DashboardKpiCard
      title="Vendas"
      icon={TrendingUp}
      badgeClassName={CATEGORY_BADGE_CLASS.emerald}
      meterFillClassName="bg-emerald-500"
      meterValueClassName="text-emerald-700"
      pending={pending}
      value={
        snapshot
          ? snapshot.completed.toLocaleString("pt-BR")
          : undefined
      }
      valueLabel="vendas concluídas no Mercado Livre"
      meterLabel={
        pending || fillPercent != null ? POSITIVE_RATINGS_LABEL : undefined
      }
      meterValue={fillPercent != null ? `${fillPercent}%` : undefined}
      meterPercent={fillPercent}
      meterHint={
        pending || fillPercent != null ? POSITIVE_RATINGS_HINT : undefined
      }
    />
  );
}
