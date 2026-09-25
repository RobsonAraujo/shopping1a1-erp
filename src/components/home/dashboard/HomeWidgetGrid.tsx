"use client";

import {
  DndContext,
  DragOverlay,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove } from "@dnd-kit/sortable";
import { useCallback, useMemo, useState } from "react";
import { GripVertical } from "lucide-react";
import { useHomeLayout } from "@/components/home/dashboard/HomeDashboardProvider";
import { HomeWidgetRenderer, hasHomeWidgetRenderer } from "@/components/home/dashboard/HomeWidgetRenderer";
import { HomeWidgetSlot } from "@/components/home/dashboard/HomeWidgetSlot";
import { reorderWidgets } from "@/lib/home/dashboard/dashboard-preferences";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";

/**
 * A grade. 1 coluna no mobile, 6 no tablet, 12 no desktop; o span de cada
 * widget vem do registry e a ordem é sempre a do usuário — inclusive no
 * mobile, onde tudo vira uma coluna.
 *
 * Sobre o arrasto na grade: a estratégia do `SortableContext` é
 * `() => null` de propósito, ou seja **os itens não se deslocam durante o
 * arrasto**. Numa grade de 12 colunas com spans heterogêneos (3/6/12) as
 * estratégias que deslocam fazem os cards saltarem de linha e o alvo virar
 * loteria. Em vez disso o alvo é sinalizado pelo contorno do slot (`isOver`) e
 * o que segue o cursor é o `DragOverlay`. A reordenação é commitada uma vez,
 * no `onDragEnd`.
 */
export function HomeWidgetGrid() {
  const { widgets, editing, update } = useHomeLayout();
  const sensors = useDndSensors();
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const renderable = useMemo(
    () =>
      widgets.flatMap((widget) => {
        const definition = getHomeWidgetDefinition(widget.id);
        if (!definition || !hasHomeWidgetRenderer(widget.id)) return [];
        return [{ widget, definition }];
      }),
    [widgets],
  );

  const sortableIds = useMemo(
    () =>
      renderable
        .filter(({ definition }) => !definition.pinned)
        .map(({ widget }) => widget.id),
    [renderable],
  );

  const onDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  }, []);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      setDraggingId(null);
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId || overId === activeId) return;

      const from = sortableIds.indexOf(activeId);
      const to = sortableIds.indexOf(overId);
      if (from === -1 || to === -1) return;

      const nextOrder = arrayMove(sortableIds, from, to);
      const pinnedIds = renderable
        .filter(({ definition }) => definition.pinned)
        .map(({ widget }) => widget.id);
      update((prefs) => reorderWidgets(prefs, [...pinnedIds, ...nextOrder]));
    },
    [sortableIds, renderable, update],
  );

  const grid = (
    <div
      id="prioridades"
      className="grid scroll-mt-24 grid-cols-1 items-start gap-3 sm:grid-cols-6 sm:gap-4 xl:grid-cols-12"
    >
      {renderable.map(({ widget, definition }) => {
        // A invisibilidade de widget cujo dado é buscado no client é
        // "não renderizar" — é aí que o request deixa de existir. Para os
        // demais o dado já veio de graça, então esconder por CSS basta e
        // mantém o diff de hidratação só de atributo.
        const clientFetched =
          definition.source.kind === "batch" ||
          definition.source.kind === "isolated";
        // Vale também em modo de edição: revelar os escondidos faria os
        // widgets isolados (PMA, promoções) dispararem o fetch deles justamente
        // por estarem escondidos. Mostrar/esconder é no sheet; a grade só
        // reordena.
        if (!widget.visible && clientFetched) return null;

        return (
          <HomeWidgetSlot
            key={widget.id}
            definition={definition}
            size={widget.size}
            visible={widget.visible}
            editing={editing}
          >
            <HomeWidgetRenderer id={widget.id} />
          </HomeWidgetSlot>
        );
      })}
    </div>
  );

  if (!editing) return grid;

  const draggingDefinition = draggingId
    ? getHomeWidgetDefinition(draggingId)
    : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDraggingId(null)}
      accessibility={{
        screenReaderInstructions: {
          draggable:
            "Pressione espaço ou enter para começar a mover o card. Use as setas para escolher a nova posição, espaço ou enter para soltar e escape para cancelar.",
        },
      }}
    >
      <SortableContext items={sortableIds} strategy={() => null}>
        {grid}
      </SortableContext>
      <DragOverlay>
        {draggingDefinition ? (
          <div className="flex items-center gap-2 rounded-2xl bg-[var(--card)] px-3 py-2 shadow-lg ring-1 ring-[var(--primary)]">
            <GripVertical
              className="size-4 text-[var(--muted-foreground)]"
              aria-hidden
            />
            <span className="text-sm font-medium text-[var(--foreground)]">
              {draggingDefinition.title}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
