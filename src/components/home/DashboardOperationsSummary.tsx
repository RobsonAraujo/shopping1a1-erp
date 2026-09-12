import { Kanban, ShoppingCart } from "lucide-react";
import { DashboardKpiCard } from "@/components/home/DashboardKpiCard";
import type { OperationsSummaryCounts } from "@/lib/compras/replenishment-cycle";

function completedShare(inProgress: number, final: number): number {
  const total = inProgress + final;
  if (total <= 0) return 0;
  return Math.round((final / total) * 100);
}

export function DashboardOperationsSummary({
  summary,
}: {
  summary: OperationsSummaryCounts;
}) {
  const purchaseTotal = summary.purchase.inProgress + summary.purchase.final;
  const fullTotal = summary.full.inProgress + summary.full.final;

  return (
    <>
      <DashboardKpiCard
        href="/dashboard/compras?tab=kanban"
        title="Compras"
        icon={ShoppingCart}
        accentClassName="bg-[var(--primary)]"
        meterFillClassName="bg-[var(--primary)]"
        meterValueClassName="text-[var(--primary)]"
        value={summary.purchase.inProgress.toLocaleString("pt-BR")}
        valueLabel={
          summary.purchase.inProgress === 1
            ? "compra em andamento"
            : "compras em andamento"
        }
        meterLabel="Já comprados neste ciclo"
        meterValue={`${summary.purchase.final.toLocaleString("pt-BR")} de ${purchaseTotal.toLocaleString("pt-BR")}`}
        meterPercent={completedShare(
          summary.purchase.inProgress,
          summary.purchase.final,
        )}
      />
      <DashboardKpiCard
        href="/dashboard/operacoes-full"
        title="Full"
        icon={Kanban}
        accentClassName="bg-teal-700"
        meterFillClassName="bg-teal-600"
        meterValueClassName="text-teal-800"
        value={summary.full.inProgress.toLocaleString("pt-BR")}
        valueLabel={
          summary.full.inProgress === 1
            ? "envio em andamento"
            : "envios em andamento"
        }
        meterLabel="Já coletados neste ciclo"
        meterValue={`${summary.full.final.toLocaleString("pt-BR")} de ${fullTotal.toLocaleString("pt-BR")}`}
        meterPercent={completedShare(summary.full.inProgress, summary.full.final)}
      />
    </>
  );
}
