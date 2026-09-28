"use client";

import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview";
import { pointerOutsideOfPreview } from "@atlaskit/pragmatic-drag-and-drop/element/pointer-outside-of-preview";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { HomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import {
  HOME_DRAG_ELEMENT_ATTR,
  HOME_DRAG_HANDLE_ATTR,
  HomeWidgetDragProvider,
} from "@/components/home/dashboard/HomeWidgetCard";
import {
  homeWidgetDragData,
  parseWidgetDragData,
} from "@/lib/home/dashboard/drop-target";

/** Linha que marca onde o card vai cair. Nada se desloca, então é ela que
 * comunica o destino. */
function DropIndicator() {
  return (
    <div
      aria-hidden
      className="h-0.5 rounded-full bg-[var(--primary)] shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_25%,transparent)]"
    />
  );
}

/**
 * Um lugar na coluna. Registra o card no Pragmatic drag and drop.
 *
 * Três decisões que não são óbvias:
 *
 * 1. **O `draggable` fica no HEADER, não no card.** O pdnd põe
 *    `draggable="true"` no elemento que recebe — e no card inteiro isso mataria a
 *    seleção de texto dentro do corpo (o card de Notas tem uma `textarea`) e
 *    faria o preview nativo ter a largura do card, acima do limite de 280px em
 *    que o Windows aplica um degradê de opacidade.
 * 2. **A alça é uma zona interna do header** (`data-home-drag-handle`), achada por
 *    `querySelector` no effect. O DnD nativo não pode ser cancelado por um
 *    `onDragStart` de filho (o listener do pdnd no header já disparou na
 *    borbulha), então `dragHandle` é o único jeito confiável de excluir o link,
 *    as ações e o menu de mover.
 * 3. **O drop target é o wrapper do card**, de altura cheia, para a divisão
 *    cima/baixo do `attachClosestEdge` cair no meio visual do card.
 *
 * Cada card sabe a **própria borda** e desenha o próprio indicador — foi isso que
 * eliminou o estado de destino que a grade mantinha.
 *
 * Widget escondido não registra nada: o rect dele é zero e ele poderia ganhar
 * uma colisão em 0,0.
 */
export function HomeWidgetSlot({
  definition,
  column,
  visible,
  dragging,
  isDragging,
  children,
}: {
  definition: HomeWidgetDefinition;
  column: number;
  visible: boolean;
  /** Há arrasto em curso na grade. */
  dragging: boolean;
  /** Este card é o que está sendo arrastado. */
  isDragging: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || !visible) return;

    const source = element.querySelector<HTMLElement>(`[${HOME_DRAG_ELEMENT_ATTR}]`);
    const handle =
      element.querySelector<HTMLElement>(`[${HOME_DRAG_HANDLE_ATTR}]`) ?? undefined;
    const data = homeWidgetDragData(definition.id, column);
    const title = definition.title;

    // `combine` junta os cleanups; devolvê-los do effect é o que faz o ciclo
    // duplo do StrictMode desregistrar e registrar de novo sem vazar listener.
    return combine(
      dropTargetForElements({
        element,
        canDrop: ({ source: dragged }) => parseWidgetDragData(dragged.data) !== null,
        // Sem isto, o ponteiro atravessando o espaço entre dois cards cai na
        // coluna por um frame e o indicador pula pro fim da lista e volta.
        getIsSticky: () => true,
        getData: ({ input, element: el }) =>
          attachClosestEdge(
            { ...data },
            { input, element: el, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self, source: dragged }) => {
          const from = parseWidgetDragData(dragged.data);
          // Borda no próprio card arrastado não quer dizer nada.
          setEdge(
            from?.widgetId === definition.id ? null : extractClosestEdge(self.data),
          );
        },
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
      ...(source
        ? [
            draggable({
              element: source,
              dragHandle: handle,
              getInitialData: () => ({ ...data }),
              onGenerateDragPreview: ({ nativeSetDragImage }) => {
                setCustomNativeDragPreview({
                  nativeSetDragImage,
                  // Tira o fantasma de baixo do cursor pra linha de destino ficar
                  // visível.
                  getOffset: pointerOutsideOfPreview({ x: "12px", y: "8px" }),
                  // DOM puro, sem `createRoot`: assim não existe uma segunda
                  // árvore React do widget, então é impossível duplicar effect ou
                  // request ao Mercado Livre. Mais forte que o DragOverlay que
                  // isso substitui.
                  render: ({ container }) => {
                    container.className =
                      "flex max-w-[240px] items-center gap-2 rounded-2xl bg-[var(--card)] px-3 py-2 text-sm font-medium text-[var(--foreground)] shadow-lg ring-1 ring-[var(--primary)]";
                    container.textContent = title;
                  },
                });
              },
            }),
          ]
        : []),
    );
  }, [visible, definition.id, definition.title, column]);

  const drag = useMemo(
    () => ({ draggable: visible, isDragging, dragging }),
    [visible, isDragging, dragging],
  );

  return (
    <div className="contents">
      {edge === "top" ? <DropIndicator /> : null}
      <div
        ref={ref}
        data-widget-id={definition.id}
        hidden={!visible}
        className={visible ? undefined : "hidden"}
      >
        <HomeWidgetDragProvider value={drag}>{children}</HomeWidgetDragProvider>
      </div>
      {edge === "bottom" ? <DropIndicator /> : null}
    </div>
  );
}
