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
import { renderCardDragPreview } from "@/lib/home/dashboard/drag-preview";
import {
  homeWidgetDragData,
  parseWidgetDragData,
} from "@/lib/home/dashboard/drop-target";
import { cn } from "@/lib/utils";

/**
 * Sombra de destino: o buraco do tamanho do card arrastado, no lugar onde ele vai
 * cair — a mecânica do exemplo "Board with shadows" (e do Trello).
 *
 * Ela **ocupa espaço de verdade**, e é isso que a torna mais informativa que uma
 * linha: com cards de 90px a 340px, o que interessa não é só *onde* cai, é
 * *quanto* espaço vai tomar. A coluna não cresce porque a origem colapsa
 * enquanto arrasta (ver o wrapper abaixo), então a altura total fica constante e
 * a sombra pré-visualiza o resultado final.
 *
 * `height` é defensivo: hoje todo card da grade manda a própria altura medida, e
 * o sheet nem chega aqui (tipo de arrasto diferente). Sem ela, um bloco baixo
 * ainda comunica a posição.
 */
const SHADOW_CLASS =
  "rounded-3xl bg-[var(--muted)]/60 ring-1 ring-[var(--border)] ring-inset";

function DropShadow({ height, edge }: { height: number | null; edge: Edge }) {
  return (
    <div
      aria-hidden
      className={cn(
        SHADOW_CLASS,
        // Repõe o `gap` da coluna entre a sombra e o card que continua no lugar.
        edge === "top" ? "mb-3 sm:mb-4" : "mt-3 sm:mt-4",
      )}
      style={{ height: height ?? 56 }}
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
 * Cada card sabe a **própria borda** e abre a própria sombra de destino.
 */
export function HomeWidgetSlot({
  definition,
  column,
  visible,
  dragging,
  isDragging,
  collapsed,
  children,
}: {
  definition: HomeWidgetDefinition;
  column: number;
  visible: boolean;
  /** Há arrasto em curso na grade. */
  dragging: boolean;
  /** Este card é o que está sendo arrastado. */
  isDragging: boolean;
  /**
   * Este card é a origem **e** já existe sombra de destino em outro card, então
   * ele cede o espaço. Decidido pela grade, que é quem vê os dois lados.
   */
  collapsed: boolean;
  children: ReactNode;
}) {
  const [wrapperEl, setWrapperEl] = useState<HTMLDivElement | null>(null);
  const [dragEl, setDragEl] = useState<HTMLElement | null>(null);
  const [handleEl, setHandleEl] = useState<HTMLElement | null>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [shadowHeight, setShadowHeight] = useState<number | null>(null);

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
    // O que este card manda quando é a origem. Medido na hora do arrasto, e do
    // WRAPPER: o elemento arrastável é o header, então medi-lo daria ~40px em vez
    // da altura do card.
    const sourceData = () =>
      homeWidgetDragData(
        definition.id,
        column,
        wrapperEl.getBoundingClientRect().height,
      );
    // O que ele publica quando é alvo — aí a altura é do outro card.
    const targetData = homeWidgetDragData(definition.id, column);

    return combine(
      dropTargetForElements({
        element: wrapperEl,
        canDrop: ({ source }) => parseWidgetDragData(source.data) !== null,
        // Sem isto, o ponteiro atravessando o espaço entre dois cards cai na
        // coluna por um frame e a sombra pula pro fim da lista e volta.
        getIsSticky: () => true,
        getData: ({ input, element }) =>
          attachClosestEdge(
            { ...targetData },
            { input, element, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self, source }) => {
          const from = parseWidgetDragData(source.data);
          // Sombra no próprio card arrastado não quer dizer nada.
          if (from?.widgetId === definition.id) {
            setEdge(null);
            return;
          }
          setEdge(extractClosestEdge(self.data));
          setShadowHeight(from?.height ?? null);
        },
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
      ...(dragEl
        ? [
            draggable({
              element: dragEl,
              dragHandle: handleEl ?? undefined,
              getInitialData: () => ({ ...sourceData() }),
              onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
                const width = wrapperEl.getBoundingClientRect().width;
                setCustomNativeDragPreview({
                  nativeSetDragImage,
                  // Medido no WRAPPER, não na alça: o fantasma é o card inteiro,
                  // então ele nasce exatamente sobre o original e o ponto onde a
                  // pessoa pegou é mantido — a sensação de carregar o card.
                  getOffset: preserveOffsetOnSource({
                    element: wrapperEl,
                    input: location.current.input,
                  }),
                  render: ({ container }) =>
                    renderCardDragPreview({
                      source: wrapperEl,
                      container,
                      width,
                    }),
                });
              },
            }),
          ]
        : []),
    );
  }, [visible, wrapperEl, dragEl, handleEl, definition.id, column]);

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
      data-dragging={isDragging || undefined}
      hidden={!visible}
      className={cn(
        "relative",
        !visible && "hidden",
        // Origem sem sombra em outro lugar: ela **é** a sombra, no próprio lugar
        // e com a própria altura. É o que faz pegar o card não empurrar nada.
        isDragging && !collapsed && SHADOW_CLASS,
        // Origem com a sombra já aberta em outro card: cede o espaço. O `-my`
        // come metade do `gap` de cada lado, que um filho de altura zero ainda
        // cobraria, então a coluna encolhe exatamente o que a outra cresceu.
        // `h-0 overflow-hidden` e **não** `display:none`/desmontagem: tirar o
        // elemento de origem do fluxo durante um arrasto nativo pode abortá-lo.
        collapsed && "-my-1.5 h-0 overflow-hidden sm:-my-2",
      )}
    >
      {edge === "top" ? <DropShadow height={shadowHeight} edge="top" /> : null}
      <div className={cn(isDragging && "pointer-events-none opacity-0")}>
        <HomeWidgetDragProvider value={drag}>{children}</HomeWidgetDragProvider>
      </div>
      {edge === "bottom" ? (
        <DropShadow height={shadowHeight} edge="bottom" />
      ) : null}
    </div>
  );
}
