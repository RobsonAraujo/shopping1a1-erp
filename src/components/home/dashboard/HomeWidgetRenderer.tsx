"use client";

import dynamic from "next/dynamic";
import { memo, Suspense, type ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardDailyChecklist } from "@/components/home/DashboardDailyChecklist";
import { DashboardFocusTimer } from "@/components/home/DashboardFocusTimer";
import { DashboardQuickNotes } from "@/components/home/DashboardQuickNotes";
import { HomeAttentionZone } from "@/components/home/dashboard/HomeAttentionZone";
import {
  HomeWidgetCard,
  HomeWidgetDragProvider,
} from "@/components/home/dashboard/HomeWidgetCard";
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
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";

function WidgetSkeleton() {
  return <Skeleton className="h-40 rounded-3xl" />;
}

const NOT_DRAGGABLE = {};

/**
 * O que um widget `core` mostra até o snapshot chegar: a parte estática (ícone e
 * título) na hora, e skeleton só no corpo.
 *
 * Contexto de arrasto vazio de propósito: se o usuário começasse a arrastar o
 * skeleton, o card real o substituiria no meio do arrasto, e o `dragend` não
 * dispara para um elemento que saiu da tela.
 */
function CoreWidgetFallback({ id }: { id: string }) {
  if (id === "atencao") return <Skeleton className="h-12 rounded-3xl" />;
  // Só aparece enquanto há passo pendente: uma faixa reservada de antemão
  // sumiria em seguida para quem já concluiu tudo.
  if (id === "onboarding") return null;
  return (
    <HomeWidgetDragProvider value={NOT_DRAGGABLE}>
      <HomeWidgetCard definitionId={id} pending />
    </HomeWidgetDragProvider>
  );
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

const HomeWidgetCatalogoElegivel = dynamic(
  () =>
    import("@/components/home/dashboard/widgets/HomeWidgetCatalogoElegivel").then(
      (m) => m.HomeWidgetCatalogoElegivel,
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
  "catalogo-elegivel": HomeWidgetCatalogoElegivel,
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
  if (getHomeWidgetDefinition(id)?.source.kind === "core") {
    return (
      <Suspense fallback={<CoreWidgetFallback id={id} />}>
        <Widget />
      </Suspense>
    );
  }
  return <Widget />;
});
