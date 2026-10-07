"use client";

import { dropTargetForElements, monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { autoScrollWindowForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHomeLayout } from "@/components/home/dashboard/HomeDashboardProvider";
import {
  HomeWidgetRenderer,
  hasHomeWidgetRenderer,
} from "@/components/home/dashboard/HomeWidgetRenderer";
import { HomeWidgetSlot } from "@/components/home/dashboard/HomeWidgetSlot";
import {
  moveWidgetToColumn,
  type DashboardWidgetPreference,
} from "@/lib/home/dashboard/dashboard-preferences";
import {
  homeColumnDropData,
  parseWidgetDragData,
  resolveDropFromTargets,
} from "@/lib/home/dashboard/drop-target";
import {
  HOME_DASHBOARD_COLUMN_COUNT,
  HOME_DASHBOARD_GRID_CLASS,
  getHomeWidgetDefinition,
  type HomeWidgetDefinition,
} from "@/lib/home/dashboard/widget-registry";
import { cn } from "@/lib/utils";

type Entry = {
  widget: DashboardWidgetPreference;
  definition: HomeWidgetDefinition;
};

function HomeWidgetColumn({
  index,
  entries,
  dragging,
  draggingId,
  shadowElsewhere,
}: {
  index: number;
  entries: Entry[];
  dragging: boolean;
  draggingId: string | null;
  /** Já existe sombra de destino em outro card — a origem pode ceder o espaço. */
  shadowElsewhere: boolean;
}) {
  const [columnEl, setColumnEl] = useState<HTMLDivElement | null>(null);
  const [isOver, setIsOver] = useState(false);

  // Drop target da coluna: é o que faz coluna **vazia** aceitar drop. Os cards
  // têm o próprio drop target e ganham deste, porque a lista que o pdnd entrega
  // vem do mais interno pra fora.
  useEffect(() => {
    if (!columnEl) return;
    return dropTargetForElements({
      element: columnEl,
      canDrop: ({ source }) => parseWidgetDragData(source.data) !== null,
      getData: () => ({ ...homeColumnDropData(index) }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    });
  }, [columnEl, index]);

  return (
    <div
      ref={setColumnEl}
      data-home-column={index}
      className={cn(
        "flex flex-col gap-3 sm:gap-4",
        // Coluna vazia com altura zero nunca é alcançada pelo cursor.
        dragging &&
          "min-h-24 rounded-3xl outline-2 outline-dashed outline-offset-4 outline-[var(--border)]",
        dragging && isOver && "outline-[var(--primary)]",
      )}
    >
      {entries.map((entry) => (
        <HomeWidgetSlot
          key={entry.widget.id}
          definition={entry.definition}
          column={index}
          visible={entry.widget.visible}
          dragging={dragging}
          isDragging={draggingId === entry.widget.id}
          collapsed={draggingId === entry.widget.id && shadowElsewhere}
        >
          <HomeWidgetRenderer id={entry.widget.id} />
        </HomeWidgetSlot>
      ))}
    </div>
  );
}

/**
 * A grade: faixas de largura cheia no topo, depois as colunas.
 *
 * Usa **Pragmatic drag and drop** (como os Kanbans e Fornecedores). Ela é
 * construída sobre o drag-and-drop nativo do HTML5, então nenhum card se desloca
 * sozinho — o destino é uma **sombra** do tamanho do card arrastado, que cada
 * card abre na própria borda (`attachClosestEdge` no slot). Era essa mecânica que
 * a gente vinha tentando forçar no dnd-kit: `verticalListSortingStrategy` supõe
 * itens de altura uniforme e aqui elas variam de ~90px a ~340px, o que fazia os
 * itens se moverem sob o cursor e o alvo mudar por consequência do próprio
 * movimento.
 *
 * A grade não guarda mais o destino: só quem está sendo arrastado (para o
 * visual) e **um** `monitorForElements` que comita no `onDrop`, uma vez.
 */
export function HomeWidgetGrid() {
  const { widgets, update, activeViewId } = useHomeLayout();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragging = draggingId !== null;

  /**
   * Existe sombra de destino em algum card?
   *
   * Vive aqui, e não no slot, porque é a **origem** que precisa saber: enquanto
   * ninguém mostra sombra (acabou de pegar o card, ou o cursor está na área vazia
   * de uma coluna), a origem guarda o próprio espaço como sombra no lugar — é o
   * que faz pegar o card não empurrar nada. Quando outro card assume a sombra, a
   * origem colapsa e a altura total da grade se mantém.
   */
  const [shadowElsewhere, setShadowElsewhere] = useState(false);

  // O commit precisa do estado mais recente SEM re-registrar o monitor: o pdnd
  // não entrega eventos a um monitor registrado no meio de um arrasto, então
  // re-registrar cancelaria o arrasto em curso. Daí o ref com deps `[]` no
  // effect do monitor. A escrita vai num effect (mutar ref durante o render é
  // erro nas regras do React Compiler).
  const latest = useRef({ widgets, update, activeViewId });
  useEffect(() => {
    latest.current = { widgets, update, activeViewId };
  }, [widgets, update, activeViewId]);

  const { banners, columns } = useMemo(() => {
    const banners: Entry[] = [];
    const columns: Entry[][] = Array.from(
      { length: HOME_DASHBOARD_COLUMN_COUNT },
      () => [],
    );
    for (const widget of widgets) {
      const definition = getHomeWidgetDefinition(widget.id);
      if (!definition || !hasHomeWidgetRenderer(widget.id)) continue;
      // Widget cujo dado é buscado no client não é renderizado quando escondido:
      // é aí que o request deixa de existir.
      const clientFetched =
        definition.source.kind === "batch" ||
        definition.source.kind === "isolated";
      if (!widget.visible && clientFetched) continue;

      const entry = { widget, definition };
      if (definition.layout === "banner") banners.push(entry);
      else columns[Math.min(widget.column, columns.length - 1)].push(entry);
    }
    return { banners, columns };
  }, [widgets]);

  const commit = useCallback((activeId: string, targets: readonly { data: Record<string | symbol, unknown> }[]) => {
    const { widgets: current, update: write, activeViewId: viewId } = latest.current;
    const target = resolveDropFromTargets(
      current,
      activeId,
      targets,
      extractClosestEdge,
    );
    if (!target) return;

    const next = moveWidgetToColumn(current, activeId, target.column, target.index);
    // `moveWidgetToColumn` devolve o array por identidade em no-op — é o que
    // mantém **uma** gravação por arrasto e o `useSyncExternalStore` sem
    // snapshot novo à toa.
    if (next === current) return;

    write((prefs) => ({
      ...prefs,
      views: prefs.views.map((view) =>
        view.id === viewId ? { ...view, widgets: [...next] } : view,
      ),
    }));
  }, []);

  useEffect(() => {
    return monitorForElements({
      canMonitor: ({ source }) => parseWidgetDragData(source.data) !== null,
      onDragStart: ({ source }) => {
        setDraggingId(parseWidgetDragData(source.data)?.widgetId ?? null);
        setShadowElsewhere(false);
      },
      onDropTargetChange: ({ source, location }) => {
        const dragged = parseWidgetDragData(source.data);
        const innermost = location.current.dropTargets[0];
        const over = innermost ? parseWidgetDragData(innermost.data) : null;
        // Só card abre sombra. Sobre a área vazia da coluna quem responde é o
        // contorno tracejado, e aí a origem segue ocupando o próprio lugar.
        setShadowElsewhere(over !== null && over.widgetId !== dragged?.widgetId);
      },
      onDrop: ({ source, location }) => {
        setDraggingId(null);
        setShadowElsewhere(false);
        const dragged = parseWidgetDragData(source.data);
        if (!dragged) return;
        commit(dragged.widgetId, location.current.dropTargets);
      },
    });
  }, [commit]);

  // Sem isto não dá pra arrastar até um card abaixo da dobra: o pdnd não faz
  // autoscroll sozinho, exige o pacote.
  useEffect(
    () =>
      autoScrollWindowForElements({
        canScroll: ({ source }) => parseWidgetDragData(source.data) !== null,
      }),
    [],
  );

  return (
    <>
      {banners.length > 0 ? (
        <div className="flex flex-col gap-3 sm:gap-4">
          {banners.map((entry) => (
            <div key={entry.widget.id} data-widget-id={entry.widget.id}>
              <HomeWidgetRenderer id={entry.widget.id} />
            </div>
          ))}
        </div>
      ) : null}

      <div
        id="prioridades"
        className={cn(
          "grid scroll-mt-24 items-start gap-3 sm:gap-4",
          HOME_DASHBOARD_GRID_CLASS,
        )}
      >
        {columns.map((entries, index) => (
          <HomeWidgetColumn
            key={index}
            index={index}
            entries={entries}
            dragging={dragging}
            draggingId={draggingId}
            shadowElsewhere={shadowElsewhere}
          />
        ))}
      </div>
    </>
  );
}
