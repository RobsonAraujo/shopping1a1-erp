"use client";

import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/utils/preserve-offset-on-source";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { HomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import { HomeWidgetDragProvider } from "@/components/home/dashboard/HomeWidgetCard";
import {
  homeWidgetDragData,
  parseWidgetDragData,
} from "@/lib/home/dashboard/drop-target";
import { cn } from "@/lib/utils";

/**
 * Linha que marca onde o card vai cair.
 *
 * **Posicionada de forma absoluta, dentro do gap da coluna.** Antes ela era um
 * irmão do card no flex, o que a punha no fluxo: cada vez que o indicador mudava
 * de lugar, todos os cards abaixo pulavam a altura da linha mais o gap. É assim
 * que os exemplos do Pragmatic fazem, e é o que faz o arrasto parecer estável.
 */
function DropIndicator({ edge }: { edge: Edge }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-[var(--primary)]",
        "shadow-[0_0_0_2px_color-mix(in_srgb,var(--primary)_25%,transparent)]",
        edge === "top" ? "-top-1.5 sm:-top-2" : "-bottom-1.5 sm:-bottom-2",
      )}
    />
  );
}

/**
 * Um lugar na coluna. Registra o card no Pragmatic drag and drop.
 *
 * Decisões que não são óbvias:
 *
 * 1. **O `draggable` fica no HEADER, não no card.** O pdnd põe
 *    `draggable="true"` no elemento que recebe — e no card inteiro isso mataria a
 *    seleção de texto dentro do corpo (o card de Notas tem uma `textarea`) e
 *    faria o preview nativo ter a largura do card, acima do limite de 280px em
 *    que o Windows aplica um degradê de opacidade.
 * 2. **A alça é uma zona interna do header.** O DnD nativo não pode ser cancelado
 *    por um `onDragStart` de filho (o listener do pdnd no header já disparou na
 *    borbulha), então `dragHandle` é o único jeito confiável de excluir o link,
 *    as ações e o menu de mover.
 * 3. **Os elementos chegam por `ref` de callback, não por `querySelector`.**
 *    Quatro widgets da Home entram por `next/dynamic` e renderizam um skeleton no
 *    primeiro paint: procurar o header no mount não achava nada e o card nunca
 *    era registrado — mostrava mãozinha e, ao arrastar, selecionava o texto. Com
 *    o elemento em estado, o effect roda de novo quando ele aparece.
 *
 * Cada card sabe a **própria borda** e desenha o próprio indicador.
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
  const [wrapperEl, setWrapperEl] = useState<HTMLDivElement | null>(null);
  const [dragEl, setDragEl] = useState<HTMLElement | null>(null);
  const [handleEl, setHandleEl] = useState<HTMLElement | null>(null);
  const [edge, setEdge] = useState<Edge | null>(null);

  const setDragElementRef = useCallback(
    (el: HTMLElement | null) => setDragEl(el),
    [],
  );
  const setDragHandleRef = useCallback(
    (el: HTMLElement | null) => setHandleEl(el),
    [],
  );

  useEffect(() => {
    if (!visible || !wrapperEl) return;
    const data = homeWidgetDragData(definition.id, column);
    const title = definition.title;

    return combine(
      dropTargetForElements({
        element: wrapperEl,
        canDrop: ({ source }) => parseWidgetDragData(source.data) !== null,
        // Sem isto, o ponteiro atravessando o espaço entre dois cards cai na
        // coluna por um frame e o indicador pula pro fim da lista e volta.
        getIsSticky: () => true,
        getData: ({ input, element }) =>
          attachClosestEdge(
            { ...data },
            { input, element, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self, source }) => {
          const from = parseWidgetDragData(source.data);
          // Borda no próprio card arrastado não quer dizer nada.
          setEdge(
            from?.widgetId === definition.id ? null : extractClosestEdge(self.data),
          );
        },
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
      ...(dragEl
        ? [
            draggable({
              element: dragEl,
              dragHandle: handleEl ?? undefined,
              getInitialData: () => ({ ...data }),
              onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
                setCustomNativeDragPreview({
                  nativeSetDragImage,
                  // Mantém o ponto onde a pessoa pegou: o fantasma acompanha o
                  // cursor como se estivesse carregando o card, que é o que os
                  // exemplos do Pragmatic fazem.
                  getOffset: preserveOffsetOnSource({
                    element: dragEl,
                    input: location.current.input,
                  }),
                  // DOM puro, sem `createRoot`: assim não existe uma segunda
                  // árvore React do widget, então é impossível duplicar effect ou
                  // request ao Mercado Livre.
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
  }, [visible, wrapperEl, dragEl, handleEl, definition.id, definition.title, column]);

  const drag = useMemo(
    () => ({
      setDragElementRef: visible ? setDragElementRef : undefined,
      setDragHandleRef: visible ? setDragHandleRef : undefined,
      draggable: visible,
      isDragging,
      dragging,
    }),
    [visible, setDragElementRef, setDragHandleRef, isDragging, dragging],
  );

  return (
    <div
      ref={setWrapperEl}
      data-widget-id={definition.id}
      hidden={!visible}
      className={cn("relative", !visible && "hidden")}
    >
      {edge ? <DropIndicator edge={edge} /> : null}
      <HomeWidgetDragProvider value={drag}>{children}</HomeWidgetDragProvider>
    </div>
  );
}
