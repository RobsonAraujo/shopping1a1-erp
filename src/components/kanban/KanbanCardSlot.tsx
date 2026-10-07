"use client";

import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/utils/preserve-offset-on-source";
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/utils/set-custom-native-drag-preview";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import {
  KanbanCardMenu,
  type KanbanCardMenuAction,
} from "@/components/kanban/KanbanCardMenu";
import type { KanbanColumnRow } from "@/hooks/use-kanban-columns";
import { renderCardDragPreview } from "@/lib/dnd/drag-preview";
import { kanbanCardDragData, parseKanbanCardDragData } from "@/lib/kanban/kanban-dnd";
import { cn } from "@/lib/utils";

const SHADOW_CLASS = "rounded-lg bg-black/10 ring-1 ring-black/5 ring-inset";

/**
 * Sombra de destino: o buraco do tamanho do card arrastado, no lugar onde ele
 * vai cair — a mecânica do Trello (e do exemplo "Board with shadows" do
 * Pragmatic). Fica **fora** do elemento que é alvo de drop: dentro dele, a
 * sombra aumentaria a altura do alvo e a borda mais próxima do cursor
 * mudaria por causa da própria sombra (topo ↔ baixo piscando).
 */
export function KanbanDropShadow({
  height,
  className,
}: {
  height: number | null;
  className?: string;
}) {
  return (
    <div aria-hidden className={cn(SHADOW_CLASS, className)} style={{ height: height ?? 72 }} />
  );
}

type KanbanCardSlotProps<T> = {
  boardId: string;
  card: T;
  cardId: string;
  columnId: string;
  /** Nome curto do card pro menu e leitores de tela. */
  label: string;
  /** Desenha o card. `menu` é o botão ⋯ (mover): cada card o posiciona no
   * próprio header, onde não cobre nenhuma informação. */
  renderCard: (card: T, menu: ReactNode) => ReactNode;
  /** Movimento deste card ainda em voo — não pode ser arrastado de novo. */
  busy: boolean;
  /** Este card é a origem do arrasto em curso. */
  isDragging: boolean;
  /**
   * Este card é a origem **e** já existe sombra de destino em outro lugar,
   * então ele cede o espaço. Decidido pelo board, que vê os dois lados.
   */
  collapsed: boolean;
  isFirst: boolean;
  isLast: boolean;
  menuColumns: readonly KanbanColumnRow[];
  onMenuAction: (cardId: string, action: KanbanCardMenuAction) => void;
};

/**
 * Um card no Kanban. Registra no Pragmatic drag and drop o card inteiro como
 * arrastável (igual ao Trello) e como alvo — cada card sabe a **própria
 * borda** sob o cursor e abre a própria sombra de destino.
 *
 * Decisões que não são óbvias:
 *
 * 1. **O estado de hover é local.** O board só sabe quem está sendo arrastado;
 *    a borda/sombra vive aqui, então mover o cursor por cima dos cards
 *    re-renderiza só o card sob ele, nunca o board.
 * 2. **A origem não desmonta.** Quando a sombra abre em outro lugar, a origem
 *    colapsa com `h-0 overflow-hidden` — tirar o elemento de origem do DOM no
 *    meio de um arrasto nativo pode abortá-lo.
 * 3. **O fantasma é um clone do DOM** (`renderCardDragPreview`), não uma
 *    segunda árvore React: o card tem `next/image`, e uma árvore nova
 *    pediria a imagem de novo.
 */
function KanbanCardSlotImpl<T>({
  boardId,
  card,
  cardId,
  columnId,
  label,
  renderCard,
  busy,
  isDragging,
  collapsed,
  isFirst,
  isLast,
  menuColumns,
  onMenuAction,
}: KanbanCardSlotProps<T>) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [edge, setEdge] = useState<Edge | null>(null);
  const [shadowHeight, setShadowHeight] = useState<number | null>(null);

  // Lido por ref: com `busy` nas deps, o fim do movimento anterior
  // re-registraria este card como alvo no meio de outro arrasto em curso.
  const busyRef = useRef(busy);
  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    if (!element) return;
    return combine(
      draggable({
        element,
        canDrag: () => !busyRef.current,
        // Medido no início do arrasto: quem abre a sombra é outro card, e ele
        // precisa saber o tamanho do buraco.
        getInitialData: () => ({
          ...kanbanCardDragData(boardId, cardId, columnId, element.getBoundingClientRect().height),
        }),
        onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
          const width = element.getBoundingClientRect().width;
          setCustomNativeDragPreview({
            nativeSetDragImage,
            // O fantasma nasce exatamente sobre o original, mantendo o ponto
            // onde a pessoa pegou — a sensação de carregar o card.
            getOffset: preserveOffsetOnSource({ element, input: location.current.input }),
            render: ({ container }) => renderCardDragPreview({ source: element, container, width }),
          });
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => parseKanbanCardDragData(source.data, boardId) !== null,
        // Sem isto, o cursor atravessando o vão entre dois cards (ou a própria
        // sombra) cai na coluna por um frame e a sombra pula pro fim e volta.
        getIsSticky: () => true,
        getData: ({ input, element: target }) =>
          attachClosestEdge(
            { ...kanbanCardDragData(boardId, cardId, columnId) },
            { input, element: target, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self, source }) => {
          const from = parseKanbanCardDragData(source.data, boardId);
          // Sombra no próprio card arrastado não quer dizer nada.
          if (from?.cardId === cardId) {
            setEdge(null);
            return;
          }
          setEdge(extractClosestEdge(self.data));
          setShadowHeight(from?.height ?? null);
        },
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [element, boardId, cardId, columnId]);

  return (
    <div
      data-dragging={isDragging || undefined}
      className={cn(
        // Origem com a sombra aberta em outro lugar: cede o espaço. O `-my-1`
        // come metade do `gap-2` de cada lado, que um filho de altura zero
        // ainda cobraria — a coluna encolhe exatamente o que a outra cresceu.
        collapsed && "-my-1 h-0 overflow-hidden",
      )}
    >
      {edge === "top" ? <KanbanDropShadow height={shadowHeight} className="mb-2" /> : null}
      <div
        ref={setElement}
        className={cn(
          // `touch-callout: none`: no iOS, segurar o card (o gesto que inicia o
          // arrasto) abriria o menu nativo do link do rodapé.
          "group/card cursor-grab select-none [-webkit-touch-callout:none] active:cursor-grabbing",
          // Origem sem sombra em outro lugar: ela **é** a sombra, no próprio
          // lugar e com a própria altura — pegar o card não empurra nada.
          isDragging && !collapsed && SHADOW_CLASS,
          busy && "cursor-progress opacity-70",
        )}
      >
        <div className={cn(isDragging && "pointer-events-none opacity-0")}>
          {renderCard(
            card,
            <KanbanCardMenu
              cardLabel={label}
              columns={menuColumns}
              currentColumnId={columnId}
              isFirst={isFirst}
              isLast={isLast}
              onAction={(action) => onMenuAction(cardId, action)}
            />,
          )}
        </div>
      </div>
      {edge === "bottom" ? <KanbanDropShadow height={shadowHeight} className="mt-2" /> : null}
    </div>
  );
}

export const KanbanCardSlot = memo(KanbanCardSlotImpl) as typeof KanbanCardSlotImpl;
