"use client";

import { useEffect, useState } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { cn } from "@/lib/utils";

const DEFAULT_ACTIVE_CLASSNAME =
  "bg-[var(--accent)]/40 ring-1 ring-inset ring-[var(--primary)]";

/** Lê o id do alvo publicado por `useDropHighlight` (no `onDrop` de um
 * `monitorForElements`); `null` se o alvo não for um deles. */
export function parseDropHighlightId(
  data: Record<string | symbol, unknown> | undefined | null,
): string | null {
  const id = data?.dropHighlightId;
  return typeof id === "string" ? id : null;
}

/**
 * Vira um elemento qualquer (tr, div, card…) numa zona de soltar do
 * Pragmatic drag and drop, com o destaque visual padrão do app enquanto um
 * item aceito (`accepts` = `type` do dado arrastado, ver `DraggableChip`)
 * está por cima. O alvo publica `id`; quem comita é o `monitorForElements`
 * da feature, lendo com `parseDropHighlightId`.
 *
 * Desestruture o retorno direto no ponto de uso (`const { setNodeRef,
 * className } = useDropHighlight(...)`) — passar o objeto inteiro e acessar
 * `.setNodeRef` depois no JSX confunde o React Compiler.
 */
export function useDropHighlight(
  id: string,
  { accepts, activeClassName = DEFAULT_ACTIVE_CLASSNAME }: { accepts: string; activeClassName?: string },
) {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [isOver, setIsOver] = useState(false);

  useEffect(() => {
    if (!element) return;
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => source.data.type === accepts,
      getData: () => ({ dropHighlightId: id }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false),
    });
  }, [element, id, accepts]);

  return {
    setNodeRef: setElement as (node: HTMLElement | null) => void,
    isOver,
    className: cn("transition-colors", isOver && activeClassName),
  };
}
