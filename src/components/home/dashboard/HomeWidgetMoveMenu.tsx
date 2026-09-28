"use client";

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useHomeLayout } from "@/components/home/dashboard/HomeDashboardProvider";
import {
  DASHBOARD_COLUMN_COUNT,
  moveWidget,
  moveWidgetSideways,
} from "@/lib/home/dashboard/dashboard-preferences";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";

/**
 * Alternativa ao arrasto, no próprio card.
 *
 * O Pragmatic drag and drop **não faz arrasto por teclado** — é decisão de
 * projeto deles, não limitação: a diretriz de acessibilidade diz "avoid
 * directional controls (arrow keys)" e "always provide alternatives to
 * dragging", com botões e menus no lugar. Este menu é essa alternativa, e fica
 * onde a pessoa já está (o card), não só dentro do painel de personalização.
 *
 * Reaproveita `moveWidget`/`moveWidgetSideways`, que já são puras e já têm teste.
 */
export function HomeWidgetMoveMenu({ widgetId }: { widgetId: string }) {
  const { widgets, update, activeViewId } = useHomeLayout();
  const definition = getHomeWidgetDefinition(widgetId);
  const widget = widgets.find((w) => w.id === widgetId);

  if (!definition || !widget || definition.layout === "banner") return null;

  const inColumn = widgets.filter((w) => {
    const other = getHomeWidgetDefinition(w.id);
    return other?.layout !== "banner" && w.column === widget.column;
  });
  const position = inColumn.findIndex((w) => w.id === widgetId);

  const canUp = position > 0;
  const canDown = position >= 0 && position < inColumn.length - 1;
  const canLeft = widget.column > 0;
  const canRight = widget.column < DASHBOARD_COLUMN_COUNT - 1;

  const actions = [
    {
      key: "up",
      label: "Mover para cima",
      icon: ArrowUp,
      enabled: canUp,
      run: () => update((prefs) => moveWidget(prefs, activeViewId, widgetId, "up")),
    },
    {
      key: "down",
      label: "Mover para baixo",
      icon: ArrowDown,
      enabled: canDown,
      run: () => update((prefs) => moveWidget(prefs, activeViewId, widgetId, "down")),
    },
    {
      key: "left",
      label: "Mover para a coluna da esquerda",
      icon: ArrowLeft,
      enabled: canLeft,
      run: () =>
        update((prefs) => moveWidgetSideways(prefs, activeViewId, widgetId, "left")),
    },
    {
      key: "right",
      label: "Mover para a coluna da direita",
      icon: ArrowRight,
      enabled: canRight,
      run: () =>
        update((prefs) => moveWidgetSideways(prefs, activeViewId, widgetId, "right")),
    },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          // `onPointerDown` parado aqui: sem isso, apertar o botão iniciaria o
          // arrasto nativo do card em vez de abrir o menu.
          onPointerDown={(event) => event.stopPropagation()}
          aria-label={`Mover ${definition.title}`}
          className="shrink-0 text-[var(--muted-foreground)] opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100"
        >
          <GripVertical className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="end">
        <p className="px-2 py-1.5 text-xs font-medium text-[var(--muted-foreground)]">
          {definition.title}
        </p>
        <ul>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <li key={action.key}>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!action.enabled}
                  onClick={action.run}
                  aria-label={`${action.label}: ${definition.title}`}
                  className="w-full justify-start"
                >
                  <Icon className="mr-2 size-4" aria-hidden />
                  {action.label}
                </Button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
