"use client";

import { useSortable } from "@dnd-kit/sortable";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  HOME_WIDGET_SIZE_SPAN,
  type HomeWidgetDefinition,
  type HomeWidgetSize,
} from "@/lib/home/dashboard/widget-registry";
import { cn } from "@/lib/utils";

/**
 * Um lugar na grade. Responsável por três coisas e nada mais — o corpo do
 * widget vive noutro componente, memoizado, pra reordenar não re-executá-lo.
 *
 * 1. **Span**: classe literal do registry (Tailwind v4 varre texto).
 * 2. **Invisibilidade**: como ela é expressa depende da origem do dado —
 *    `hideWithCss` para o que já veio de graça do servidor (esconder por CSS
 *    mantém o diff de hidratação só de atributo), e não-renderizar para o que
 *    seria buscado no client (aí sim a economia é real).
 * 3. **Modo de edição**: handle de arrasto e corpo inerte.
 */
export function HomeWidgetSlot({
  definition,
  size,
  visible,
  editing,
  children,
}: {
  definition: HomeWidgetDefinition;
  size: HomeWidgetSize;
  visible: boolean;
  editing: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    isDragging,
    isOver,
  } = useSortable({
    id: definition.id,
    // Fora do modo de edição o slot é um card comum: nada de listeners
    // roubando cliques de link ou de checkbox.
    disabled: !editing || Boolean(definition.pinned),
  });

  const span = HOME_WIDGET_SIZE_SPAN[size];

  return (
    <div
      ref={setNodeRef}
      data-widget-id={definition.id}
      hidden={!visible}
      className={cn(
        span,
        !visible && "hidden",
        editing && "relative rounded-3xl",
        editing &&
          !definition.pinned &&
          "outline-2 outline-dashed outline-offset-2 outline-[var(--border)]",
        isOver && editing && "outline-[var(--primary)]",
        isDragging && "opacity-40",
      )}
    >
      {editing && !definition.pinned ? (
        <Button
          ref={setActivatorNodeRef}
          variant="secondary"
          size="icon-sm"
          className="absolute -top-2 -right-2 z-10 cursor-grab shadow-sm active:cursor-grabbing"
          aria-label={`Mover ${definition.title}. Use as setas para reordenar.`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" aria-hidden />
        </Button>
      ) : null}

      {/* Em edição o corpo fica inerte: sem isso, um toque no card dispararia
          o link ou o checkbox em vez de arrastar — e no mobile o
          press-and-hold do TouchSensor brigaria com o toque-pra-expandir dos
          cards colapsáveis.

          `inert` e não `aria-hidden` + `pointer-events-none`: aquele par
          bloqueia o mouse mas deixa os links focáveis por Tab, o que põe foco
          dentro de conteúdo escondido do leitor de tela — violação de
          acessibilidade. `inert` remove interação E foco de uma vez. */}
      <div inert={editing} className={cn(editing && "select-none")}>
        {children}
      </div>
    </div>
  );
}
