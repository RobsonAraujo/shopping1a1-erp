"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

const DEFAULT_ACTIVE_CLASSNAME =
  "bg-[var(--accent)]/40 ring-1 ring-inset ring-[var(--primary)]";

/**
 * Vira um elemento qualquer (tr, div, card…) numa zona de soltar do
 * drag-and-drop, com o destaque visual padrão do app enquanto um item é
 * arrastado por cima. Reaproveitar em vez de chamar `useDroppable` cru a
 * cada nova feature de drag-and-drop.
 *
 * Desestruture o retorno direto no ponto de uso (`const { setNodeRef,
 * className } = useDropHighlight(id)`) — passar o objeto inteiro e acessar
 * `.setNodeRef` depois (ex.: `drop.setNodeRef`) no JSX confunde o React
 * Compiler ("Cannot access refs during render").
 */
export function useDropHighlight(id: string, activeClassName = DEFAULT_ACTIVE_CLASSNAME) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return {
    setNodeRef,
    isOver,
    className: cn("transition-colors", isOver && activeClassName),
  };
}
