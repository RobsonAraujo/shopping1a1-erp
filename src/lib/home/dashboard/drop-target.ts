import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import type { DashboardWidgetPreference } from "@/lib/home/dashboard/dashboard-preferences";
import {
  HOME_WIDGET_DEFINITIONS,
  type HomeWidgetDefinition,
} from "@/lib/home/dashboard/widget-registry";

/**
 * A parte pura do arrasto da Home.
 *
 * O Pragmatic drag and drop passa dados como `Record<string | symbol, unknown>`,
 * sem tipo. Este módulo é o **único** lugar que lê esses dados e o único que faz
 * a conta de índice — assim a parte sem tipo fica cercada e testável, e os
 * componentes só lidam com valores já validados.
 */

export const HOME_WIDGET_DRAG_TYPE = "home-widget";
export const HOME_COLUMN_DROP_TYPE = "home-column";

export type HomeWidgetDragData = {
  type: typeof HOME_WIDGET_DRAG_TYPE;
  widgetId: string;
  column: number;
};

export type HomeColumnDropData = {
  type: typeof HOME_COLUMN_DROP_TYPE;
  column: number;
};

export type HomeDropTarget = { column: number; index: number };

type UnknownData = Record<string | symbol, unknown>;

export function homeWidgetDragData(
  widgetId: string,
  column: number,
): HomeWidgetDragData {
  return { type: HOME_WIDGET_DRAG_TYPE, widgetId, column };
}

export function homeColumnDropData(column: number): HomeColumnDropData {
  return { type: HOME_COLUMN_DROP_TYPE, column };
}

/** Lê os dados de um card arrastado/alvo, devolvendo `null` se não for nosso. */
export function parseWidgetDragData(
  data: UnknownData | undefined | null,
): HomeWidgetDragData | null {
  if (!data || data.type !== HOME_WIDGET_DRAG_TYPE) return null;
  const { widgetId, column } = data as Partial<HomeWidgetDragData>;
  if (typeof widgetId !== "string" || widgetId.length === 0) return null;
  if (typeof column !== "number" || !Number.isInteger(column)) return null;
  return { type: HOME_WIDGET_DRAG_TYPE, widgetId, column };
}

/** Lê os dados de uma coluna alvo, devolvendo `null` se não for nossa. */
export function parseColumnDropData(
  data: UnknownData | undefined | null,
): HomeColumnDropData | null {
  if (!data || data.type !== HOME_COLUMN_DROP_TYPE) return null;
  const { column } = data as Partial<HomeColumnDropData>;
  if (typeof column !== "number" || !Number.isInteger(column)) return null;
  return { type: HOME_COLUMN_DROP_TYPE, column };
}

/**
 * Os cards de uma coluna, **sem as faixas e sem o card que está sendo movido**.
 *
 * Excluir as faixas não é detalhe: `atencao` e `onboarding` são faixas e ficam
 * com `column: 0`, então incluí-las inflava em 2 todo índice da coluna da
 * esquerda. O `moveWidgetToColumn` já as excluía, e a divergência entre as duas
 * convenções fazia o card cair no fim da coluna em vez de onde a linha indicava —
 * só na esquerda, porque é lá que as faixas moram.
 */
function cardsInColumn(
  widgets: readonly DashboardWidgetPreference[],
  column: number,
  excludeId: string,
  definitions: readonly HomeWidgetDefinition[],
): DashboardWidgetPreference[] {
  const byId = new Map(definitions.map((d) => [d.id, d]));
  return widgets.filter(
    (w) =>
      w.id !== excludeId &&
      w.column === column &&
      byId.get(w.id)?.layout !== "banner",
  );
}

/**
 * Soltou sobre outro card: a borda (vinda do `attachClosestEdge`) decide antes
 * ou depois.
 *
 * O índice é contado na coluna de destino **já excluindo o card que está sendo
 * movido** — é exatamente o que `moveWidgetToColumn` espera, porque ele faz
 * remove-then-insert.
 */
export function resolveDropOnWidget(
  widgets: readonly DashboardWidgetPreference[],
  activeId: string,
  overWidgetId: string,
  edge: Edge | null,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): HomeDropTarget | null {
  if (activeId === overWidgetId) return null;
  const active = widgets.find((w) => w.id === activeId);
  const over = widgets.find((w) => w.id === overWidgetId);
  if (!active || !over) return null;

  const others = cardsInColumn(widgets, over.column, activeId, definitions);
  const position = others.findIndex((w) => w.id === overWidgetId);
  if (position === -1) return null;

  // Só as bordas verticais importam em colunas empilhadas; qualquer outra coisa
  // (ou ausência de borda) cai em "antes", que é o alvo mais próximo do cursor.
  return {
    column: over.column,
    index: edge === "bottom" ? position + 1 : position,
  };
}

/** Soltou na área vazia de uma coluna: vai pro fim dela. */
export function resolveDropOnColumn(
  widgets: readonly DashboardWidgetPreference[],
  activeId: string,
  column: number,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): HomeDropTarget | null {
  if (!widgets.some((w) => w.id === activeId)) return null;
  if (!Number.isInteger(column) || column < 0) return null;
  return {
    column,
    index: cardsInColumn(widgets, column, activeId, definitions).length,
  };
}

/**
 * Resolve o destino a partir da lista de alvos que o pdnd entrega no `onDrop`.
 * Ela vem ordenada **do mais interno para fora** (`[card, coluna]`), então o
 * card ganha da coluna: se o cursor está sobre um card, é a borda dele que
 * decide; a coluna só responde quando o cursor está na área vazia.
 */
export function resolveDropFromTargets(
  widgets: readonly DashboardWidgetPreference[],
  activeId: string,
  targets: readonly { data: UnknownData }[],
  extractEdge: (data: UnknownData) => Edge | null,
  definitions: readonly HomeWidgetDefinition[] = HOME_WIDGET_DEFINITIONS,
): HomeDropTarget | null {
  for (const target of targets) {
    const widget = parseWidgetDragData(target.data);
    if (widget) {
      return resolveDropOnWidget(
        widgets,
        activeId,
        widget.widgetId,
        extractEdge(target.data),
        definitions,
      );
    }
    const column = parseColumnDropData(target.data);
    if (column) {
      return resolveDropOnColumn(
        widgets,
        activeId,
        column.column,
        definitions,
      );
    }
  }
  return null;
}
