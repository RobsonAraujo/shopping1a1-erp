"use client";

import dynamic from "next/dynamic";
import { memo, type ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardDailyChecklist } from "@/components/home/DashboardDailyChecklist";
import { DashboardFocusTimer } from "@/components/home/DashboardFocusTimer";
import { DashboardQuickNotes } from "@/components/home/DashboardQuickNotes";
import { HomeAttentionZone } from "@/components/home/dashboard/HomeAttentionZone";
import { HomeWidgetCatalogHealth } from "@/components/home/dashboard/widgets/HomeWidgetCatalogHealth";
import {
  HomeWidgetComprasKpi,
  HomeWidgetFullKpi,
} from "@/components/home/dashboard/widgets/HomeWidgetOperations";
import { HomeWidgetPendings } from "@/components/home/dashboard/widgets/HomeWidgetPendings";
import {
  HomeWidgetCatalogoPerdendo,
  HomeWidgetOnboarding,
  HomeWidgetVendasKpi,
} from "@/components/home/dashboard/widgets/HomeWidgetSimple";

function WidgetSkeleton() {
  return <Skeleton className="h-40 rounded-3xl" />;
}

/**
 * Widgets p2 entram por `dynamic()`: quem nunca liga o card de estoque não
 * baixa o código dele. **Sem `ssr: false`** de propósito — assim um p2 que se
 * alimenta do snapshot de servidor ainda sai renderizado no HTML.
 */
const HomeWidgetShortcuts = dynamic(
  () =>
    import("@/components/home/dashboard/widgets/HomeWidgetShortcuts").then(
      (m) => m.HomeWidgetShortcuts,
    ),
  { loading: WidgetSkeleton },
);

const HomeWidgetDreResult = dynamic(
  () =>
    import("@/components/home/dashboard/widgets/HomeWidgetDreResult").then(
      (m) => m.HomeWidgetDreResult,
    ),
  { loading: WidgetSkeleton },
);

const HomeWidgetPma = dynamic(
  () =>
    import("@/components/home/dashboard/widgets/HomeWidgetPma").then(
      (m) => m.HomeWidgetPma,
    ),
  { loading: WidgetSkeleton },
);

const HomeWidgetPromocoes = dynamic(
  () =>
    import("@/components/home/dashboard/widgets/HomeWidgetPromocoes").then(
      (m) => m.HomeWidgetPromocoes,
    ),
  { loading: WidgetSkeleton },
);

/**
 * Mapa id → componente. É a única coisa que um widget novo precisa além da
 * entrada no registry; um teste garante que todo id do registry está aqui.
 */
const RENDERERS: Record<string, ComponentType> = {
  atencao: HomeAttentionZone,
  onboarding: HomeWidgetOnboarding,
  "kpi-vendas": HomeWidgetVendasKpi,
  "kpi-compras": HomeWidgetComprasKpi,
  "kpi-full": HomeWidgetFullKpi,
  "produtos-saude": HomeWidgetCatalogHealth,
  "tarefas-hoje": DashboardDailyChecklist,
  notas: DashboardQuickNotes,
  foco: DashboardFocusTimer,
  "dre-resultado": HomeWidgetDreResult,
  pendencias: HomeWidgetPendings,
  "catalogo-perdendo": HomeWidgetCatalogoPerdendo,
  pma: HomeWidgetPma,
  promocoes: HomeWidgetPromocoes,
  atalhos: HomeWidgetShortcuts,
};

export function hasHomeWidgetRenderer(id: string): boolean {
  return id in RENDERERS;
}

/**
 * `memo` é o que faz reordenar ser barato: o slot re-renderiza na posição
 * nova, recria o elemento com a MESMA prop `id`, o memo corta, e o corpo do
 * widget não reexecuta — nenhum effect roda de novo, nenhum fetch se repete.
 */
export const HomeWidgetRenderer = memo(function HomeWidgetRenderer({
  id,
}: {
  id: string;
}) {
  const Widget = RENDERERS[id];
  if (!Widget) return null;
  return <Widget />;
});
