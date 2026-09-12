"use client";

import { useRef, type PointerEvent as ReactPointerEvent } from "react";

/**
 * Arrastar o fundo vazio do board (fora de card/coluna) com o mouse rola o
 * board horizontalmente, tipo Trello/Miro. Só ativa quando o pointerdown cai
 * direto no container (não em um filho — card/coluna já tem seu próprio
 * drag-and-drop do dnd-kit) e é mouse (touch já rola nativamente por scroll
 * do sistema; interceptar aqui duplicaria/atrapalharia esse gesto).
 */
export function useKanbanPanScroll() {
  const panState = useRef<{
    pointerId: number;
    startX: number;
    scrollLeft: number;
  } | null>(null);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    if (event.target !== event.currentTarget) return;
    const el = event.currentTarget;
    panState.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: el.scrollLeft,
    };
    el.setPointerCapture(event.pointerId);
    el.classList.add("cursor-grabbing", "select-none");
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = panState.current;
    if (!state || state.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = state.scrollLeft - (event.clientX - state.startX);
  }

  function endPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (panState.current?.pointerId !== event.pointerId) return;
    panState.current = null;
    event.currentTarget.classList.remove("cursor-grabbing", "select-none");
  }

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: endPan,
    onPointerCancel: endPan,
  };
}
