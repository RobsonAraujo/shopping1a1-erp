"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ArrowDown, ArrowUp, GripVertical, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  HOME_WIDGET_SIZE_LABEL,
  type HomeWidgetDefinition,
  type HomeWidgetSize,
} from "@/lib/home/dashboard/widget-registry";
import type { DashboardWidgetPreference } from "@/lib/home/dashboard/dashboard-preferences";
import { CATEGORY_BADGE_CLASS } from "@/lib/ui/tone";
import { cn } from "@/lib/utils";

/**
 * Uma linha do sheet de personalização. Arrastável, mas com ↑/↓ de verdade ao
 * lado: a acessibilidade não pode depender de arrastar, e teclado precisa de
 * um caminho óbvio, não só do `KeyboardSensor`.
 */
export function HomeCustomizeRow({
  definition,
  preference,
  canMoveUp,
  canMoveDown,
  onToggle,
  onResize,
  onMove,
}: {
  definition: HomeWidgetDefinition;
  preference: DashboardWidgetPreference;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggle: (visible: boolean) => void;
  onResize: (size: HomeWidgetSize) => void;
  onMove: (direction: "up" | "down") => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: definition.id, disabled: Boolean(definition.pinned) });

  const Icon = definition.icon;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-start gap-2 rounded-xl border border-transparent px-1 py-2.5",
        isDragging && "border-[var(--primary)] bg-[var(--card)] shadow-sm",
      )}
    >
      {definition.pinned ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex size-8 shrink-0 items-center justify-center text-[var(--muted-foreground)]">
              <Lock className="size-3.5" aria-hidden />
              <span className="sr-only">Sempre visível no topo</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Sempre visível no topo</TooltipContent>
        </Tooltip>
      ) : (
        <Button
          ref={setActivatorNodeRef}
          variant="ghost"
          size="icon-sm"
          className="shrink-0 cursor-grab active:cursor-grabbing"
          aria-label={`Arrastar ${definition.title}`}
          {...attributes}
          {...listeners}
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

        {definition.supportedSizes.length > 1 ? (
          <div className="mt-2 max-w-40">
            <FormSelect
              id={`size-${definition.id}`}
              value={preference.size}
              onValueChange={(value) => onResize(value as HomeWidgetSize)}
              options={definition.supportedSizes.map((size) => ({
                value: size,
                label: HOME_WIDGET_SIZE_LABEL[size],
              }))}
              triggerClassName="h-8 text-xs"
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        {!definition.pinned ? (
          <>
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
