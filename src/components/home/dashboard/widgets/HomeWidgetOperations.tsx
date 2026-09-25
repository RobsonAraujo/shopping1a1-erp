"use client";

import { Kanban, ShoppingCart } from "lucide-react";
import { DashboardKpiCard } from "@/components/home/DashboardKpiCard";
import { HomeWidgetCard, HomeWidgetEmpty } from "@/components/home/dashboard/HomeWidgetCard";
import { useHomeCore } from "@/components/home/dashboard/HomeDashboardProvider";
import { completedShare } from "@/lib/home/dashboard/operations-kpi";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import { CATEGORY_BADGE_CLASS } from "@/lib/ui/tone";

/**
 * Compras e Full, agora um widget cada. Antes era um componente só devolvendo
 * dois `DashboardKpiCard` num fragmento, o que não dá pra dividir entre dois
 * lugares da grade — mas as props de cada card são as mesmas de antes.
 */

function OperationsFallback({ id }: { id: "kpi-compras" | "kpi-full" }) {
  const definition = getHomeWidgetDefinition(id);
  if (!definition) return null;
  return (
    <HomeWidgetCard definition={definition}>
      <HomeWidgetEmpty
        title="Sem dados de operação"
        description="Não foi possível carregar o kanban agora. Tente recarregar."
      />
    </HomeWidgetCard>
  );
}

export function HomeWidgetComprasKpi() {
  const { operations } = useHomeCore();
  if (!operations) return <OperationsFallback id="kpi-compras" />;

  const { purchase } = operations;
  const total = purchase.inProgress + purchase.final;

  return (
    <DashboardKpiCard
      href="/dashboard/compras?tab=kanban"
      title="Compras"
      icon={ShoppingCart}
      badgeClassName={CATEGORY_BADGE_CLASS.primary}
      meterFillClassName="bg-[var(--primary)]"
      meterValueClassName="text-[var(--primary)]"
      value={purchase.inProgress.toLocaleString("pt-BR")}
      valueLabel={
        purchase.inProgress === 1
          ? "compra em andamento"
          : "compras em andamento"
      }
      meterLabel="Já comprados neste ciclo"
      meterValue={`${purchase.final.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`}
      meterPercent={completedShare(purchase.inProgress, purchase.final)}
    />
  );
}

export function HomeWidgetFullKpi() {
  const { operations } = useHomeCore();
  if (!operations) return <OperationsFallback id="kpi-full" />;

  const { full } = operations;
  const total = full.inProgress + full.final;

  return (
    <DashboardKpiCard
      href="/dashboard/operacoes-full"
      title="Full"
      icon={Kanban}
      badgeClassName={CATEGORY_BADGE_CLASS.violet}
      meterFillClassName="bg-violet-500"
      meterValueClassName="text-violet-700"
      value={full.inProgress.toLocaleString("pt-BR")}
      valueLabel={
        full.inProgress === 1 ? "envio em andamento" : "envios em andamento"
      }
      meterLabel="Já coletados neste ciclo"
      meterValue={`${full.final.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`}
      meterPercent={completedShare(full.inProgress, full.final)}
    />
  );
}
