"use client";

import type { ReactNode } from "react";
import { useDraggable } from "@dnd-kit/core";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

type ChipVisualProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Só o visual do chip, sem comportamento de drag — usado dentro de
 * `DraggableChip` e também pelo `<DragOverlay>` (a cópia flutuante que
 * segue o cursor precisa do mesmo visual, mas não é ela própria arrastável).
 */
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
  children: ReactNode;
  className?: string;
};

/**
 * Chip pequeno e arrastável — bloco genérico de drag-and-drop do app (só
 * cuida do "pegar e segurar"; o conteúdo é livre). Reaproveitar em qualquer
 * feature futura que precise arrastar um item pra um alvo (`useDropHighlight`
 * do lado de quem recebe), em vez de reimplementar `useDraggable` cru.
 *
 * Some (opacity 0) enquanto arrasta — a posição visual durante o drag é
 * responsabilidade de um `<DragOverlay>` no `DndContext` pai (renderizado
 * fora de qualquer container com scroll/overflow, então nunca fica "preso"
 * numa caixinha pequena nem é cortado ao passar da borda dela). Sem
 * `DragOverlay` no contexto, o chip original só fica invisível — sempre
 * inclua um `<DragOverlay>` que renderize `<ChipVisual>` pro item ativo.
 */
export function DraggableChip({ id, children, className }: DraggableChipProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn("cursor-grab touch-none active:cursor-grabbing", isDragging && "opacity-0")}
    >
      <ChipVisual className={className}>{children}</ChipVisual>
    </div>
  );
}
