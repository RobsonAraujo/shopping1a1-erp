"use client";

import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/utils/combine";
import { attachClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/attach-closest-edge";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  GripVertical,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { HomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";
import type { DashboardWidgetPreference } from "@/lib/home/dashboard/dashboard-preferences";
import {
  homeWidgetDragData,
  parseWidgetDragData,
} from "@/lib/home/dashboard/drop-target";
import { CATEGORY_BADGE_CLASS } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

/**
 * Uma linha do sheet de personalização. Arrastável com o Pragmatic drag and drop
 * — o caso mais simples dele: lista vertical de altura uniforme.
 *
 * Os quatro botões (↑/↓ na coluna, ←/→ entre colunas) continuam sendo o caminho
 * garantido de teclado: o pdnd não arrasta por teclado de propósito.
 */
export function HomeCustomizeRow({
  definition,
  preference,
  canMoveUp,
  canMoveDown,
  canMoveLeft,
  canMoveRight,
  onToggle,
  onMove,
  onMoveSideways,
}: {
  definition: HomeWidgetDefinition;
  preference: DashboardWidgetPreference;
  canMoveUp: boolean;
  canMoveDown: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onToggle: (visible: boolean) => void;
  onMove: (direction: "up" | "down") => void;
  onMoveSideways: (direction: "left" | "right") => void;
}) {
  const isBanner = definition.layout === "banner";
  const rowRef = useRef<HTMLLIElement | null>(null);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [edge, setEdge] = useState<Edge | null>(null);

  useEffect(() => {
    const element = rowRef.current;
    const handle = handleRef.current;
    if (isBanner || !element || !handle) return;
    const data = homeWidgetDragData(definition.id, preference.column);

    return combine(
      draggable({
        element,
        dragHandle: handle,
        getInitialData: () => ({ ...data }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => {
          setIsDragging(false);
          setEdge(null);
        },
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) => parseWidgetDragData(source.data) !== null,
        getIsSticky: () => true,
        getData: ({ input, element: el }) =>
          attachClosestEdge(
            { ...data },
            { input, element: el, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ self, source }) => {
          const from = parseWidgetDragData(source.data);
          setEdge(
            from?.widgetId === definition.id ? null : extractClosestEdge(self.data),
          );
        },
        onDragLeave: () => setEdge(null),
        onDrop: () => setEdge(null),
      }),
    );
  }, [isBanner, definition.id, preference.column]);

  const Icon = definition.icon;

  return (
    <li
      ref={rowRef}
      data-customize-row={definition.id}
      className={cn(
        "flex items-start gap-2 rounded-xl border border-transparent px-1 py-2.5",
        isDragging && "opacity-40",
        edge === "top" && "border-t-[var(--primary)]",
        edge === "bottom" && "border-b-[var(--primary)]",
      )}
    >
      {isBanner ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-8 shrink-0 items-center justify-center text-[var(--muted-foreground)]">
              <Lock className="size-3.5" aria-hidden />
              <span className="sr-only">Faixa fixa no topo</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Faixa fixa no topo</TooltipContent>
        </Tooltip>
      ) : (
        <Button
          ref={handleRef}
          variant="ghost"
          size="icon-sm"
          className="shrink-0 cursor-grab active:cursor-grabbing"
          aria-label={`Arrastar ${definition.title}`}
        >
          <GripVertical className="size-4" aria-hidden />
        </Button>
      )}

      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
          CATEGORY_BADGE_CLASS[definition.tone],
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--foreground)]">
          {definition.title}
        </p>
        <p className="mt-0.5 text-xs leading-snug text-[var(--muted-foreground)]">
          {definition.description}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {!isBanner ? (
          <>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canMoveLeft}
              onClick={() => onMoveSideways("left")}
              aria-label={`Mover ${definition.title} para a coluna anterior`}
            >
              <ArrowLeft className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canMoveRight}
              onClick={() => onMoveSideways("right")}
              aria-label={`Mover ${definition.title} para a coluna seguinte`}
            >
              <ArrowRight className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canMoveUp}
              onClick={() => onMove("up")}
              aria-label={`Mover ${definition.title} para cima`}
            >
              <ArrowUp className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canMoveDown}
              onClick={() => onMove("down")}
              aria-label={`Mover ${definition.title} para baixo`}
            >
              <ArrowDown className="size-4" aria-hidden />
            </Button>
          </>
        ) : null}
        <Switch
          checked={preference.visible}
          disabled={Boolean(definition.pinned)}
          onCheckedChange={onToggle}
          aria-label={`Mostrar ${definition.title}`}
          className="ml-1"
        />
      </div>
    </li>
  );
}
