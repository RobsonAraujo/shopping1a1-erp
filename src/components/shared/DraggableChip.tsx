"use client";

import { useEffect, useState, type ReactNode } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type ChipDragData = { type: string; id: string };

/** Dado que o chip publica no arrasto — `type` separa uma feature da outra,
 * pra um monitor nunca reagir ao arrasto de outra superfície da página. */
export function chipDragData(type: string, id: string): ChipDragData {
  return { type, id };
}

/** Lê o id de um chip do `type` pedido; `null` se o dado não for dele. O
 * Pragmatic entrega `Record<string | symbol, unknown>`, sem tipo. */
export function parseChipDragId(
  data: Record<string | symbol, unknown> | undefined | null,
  type: string,
): string | null {
  if (!data || data.type !== type) return null;
  return typeof data.id === "string" && data.id.length > 0 ? data.id : null;
}

type ChipVisualProps = {
  children: ReactNode;
  className?: string;
};

/** Só o visual do chip, sem comportamento de drag. */
export function ChipVisual({ children, className }: ChipVisualProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-1.5 text-xs font-medium shadow-sm",
        className,
      )}
    >
      <GripVertical className="size-3.5 shrink-0 text-[var(--muted-foreground)]" aria-hidden />
      {children}
    </div>
  );
}

type DraggableChipProps = {
  id: string;
  /** Tipo do arrasto (ver `chipDragData`); quem recebe usa o mesmo em
   * `useDropHighlight({ accepts })` e no `monitorForElements`. */
  type: string;
  children: ReactNode;
  className?: string;
};

/**
 * Chip pequeno e arrastável (Pragmatic drag and drop) — bloco genérico pra
 * arrastar um item até um alvo (`useDropHighlight` do lado de quem recebe;
 * quem comita é um `monitorForElements` da feature). O fantasma é o
 * snapshot nativo do próprio chip, então não precisa de overlay: o original
 * só fica esmaecido enquanto arrasta.
 */
export function DraggableChip({ id, type, children, className }: DraggableChipProps) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!element) return;
    return draggable({
      element,
      getInitialData: () => ({ ...chipDragData(type, id) }),
      onDragStart: () => setIsDragging(true),
      onDrop: () => setIsDragging(false),
    });
  }, [element, type, id]);

  return (
    <div
      ref={setElement}
      className={cn("cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    >
      <ChipVisual className={className}>{children}</ChipVisual>
    </div>
  );
}
