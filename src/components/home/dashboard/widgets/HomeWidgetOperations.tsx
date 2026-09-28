"use client";

import {
  HomeWidgetCard,
  HomeWidgetEmpty,
  HomeWidgetMeter,
  HomeWidgetMetric,
} from "@/components/home/dashboard/HomeWidgetCard";
import { useHomeCore } from "@/components/home/dashboard/HomeDashboardProvider";
import { completedShare } from "@/lib/home/dashboard/operations-kpi";

/**
 * Compras e Full, um widget cada. Antes eram um componente só devolvendo dois
 * `DashboardKpiCard` num fragmento (o que não dá pra dividir entre dois lugares
 * da grade), e o card inteiro era um `<Link>` — o que brigaria com o arrasto.
 * Agora o link é a seta do header, que vem do `href` do registry.
 */

function OperationsCard({
  definitionId,
  inProgress,
  final,
  valueLabel,
  meterLabel,
  fillClassName,
  valueClassName,
}: {
  definitionId: string;
  inProgress: number;
  final: number;
  valueLabel: string;
  meterLabel: string;
  fillClassName: string;
  valueClassName: string;
}) {
  const total = inProgress + final;
  return (
    <HomeWidgetCard definitionId={definitionId}>
      <HomeWidgetMetric
        value={inProgress.toLocaleString("pt-BR")}
        label={valueLabel}
      />
      <HomeWidgetMeter
        label={meterLabel}
        value={`${final.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")}`}
        percent={completedShare(inProgress, final)}
        fillClassName={fillClassName}
        valueClassName={valueClassName}
      />
    </HomeWidgetCard>
  );
}

function OperationsFallback({ definitionId }: { definitionId: string }) {
  return (
    <HomeWidgetCard definitionId={definitionId}>
      <HomeWidgetEmpty
        title="Sem dados de operação"
        description="Não foi possível carregar o kanban agora. Tente recarregar."
      />
    </HomeWidgetCard>
  );
}

export function HomeWidgetComprasKpi() {
  const { operations } = useHomeCore();
  if (!operations) return <OperationsFallback definitionId="kpi-compras" />;

  const { purchase } = operations;
  return (
    <OperationsCard
      definitionId="kpi-compras"
      inProgress={purchase.inProgress}
      final={purchase.final}
      valueLabel={
        purchase.inProgress === 1
          ? "compra em andamento"
          : "compras em andamento"
      }
      meterLabel="Já comprados neste ciclo"
      fillClassName="bg-[var(--primary)]"
      valueClassName="text-[var(--primary)]"
    />
  );
}

export function HomeWidgetFullKpi() {
  const { operations } = useHomeCore();
  if (!operations) return <OperationsFallback definitionId="kpi-full" />;

  const { full } = operations;
  return (
    <OperationsCard
      definitionId="kpi-full"
      inProgress={full.inProgress}
      final={full.final}
      valueLabel={
        full.inProgress === 1 ? "envio em andamento" : "envios em andamento"
      }
      meterLabel="Já coletados neste ciclo"
      fillClassName="bg-violet-500"
      valueClassName="text-violet-700"
    />
  );
}
