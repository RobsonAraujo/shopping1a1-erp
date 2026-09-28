"use client";

import { RotateCcw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/adapter/element-adapter";
import { extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge/extract-closest-edge";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HomeCustomizeRow } from "@/components/home/dashboard/HomeCustomizeRow";
import { useHomeLayout } from "@/components/home/dashboard/HomeDashboardProvider";
import {
  DASHBOARD_COLUMN_COUNT,
  moveWidget,
  moveWidgetSideways,
  moveWidgetToColumn,
  resetView,
  setWidgetVisible,
  type DashboardWidgetPreference,
} from "@/lib/home/dashboard/dashboard-preferences";
import {
  parseWidgetDragData,
  resolveDropFromTargets,
} from "@/lib/home/dashboard/drop-target";
import { getHomeWidgetDefinition } from "@/lib/home/dashboard/widget-registry";

const COLUMN_LABEL = ["Coluna da esquerda", "Coluna da direita"];

/**
 * "Personalizar início". Mudança aplica na hora — não há Salvar/Cancelar porque
 * o destino é `localStorage` e não existe o que dar errado no meio.
 *
 * Agrupado por **coluna**, espelhando o layout real: agora que a coluna é parte
 * da configuração, agrupar por categoria esconderia justamente a informação que
 * a pessoa está tentando ajustar.
 */
export function HomeCustomizeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { widgets, update, activeViewId, view } = useHomeLayout();

  const groups = useMemo(() => {
    const banners: DashboardWidgetPreference[] = [];
    const columns: DashboardWidgetPreference[][] = Array.from(
      { length: DASHBOARD_COLUMN_COUNT },
      () => [],
    );
    for (const widget of widgets) {
      const definition = getHomeWidgetDefinition(widget.id);
      if (!definition) continue;
      if (definition.layout === "banner") banners.push(widget);
      else columns[Math.min(widget.column, columns.length - 1)].push(widget);
    }
    return { banners, columns };
  }, [widgets]);

  // Valores frescos sem re-registrar o monitor: o pdnd não entrega eventos a um
  // monitor registrado no meio de um arrasto.
  const latest = useRef({ widgets, update, activeViewId });
  useEffect(() => {
    latest.current = { widgets, update, activeViewId };
  }, [widgets, update, activeViewId]);

  const commit = useCallback(
    (
      activeId: string,
      targets: readonly { data: Record<string | symbol, unknown> }[],
    ) => {
      const { widgets: current, update: write, activeViewId: viewId } = latest.current;
      const target = resolveDropFromTargets(
        current,
        activeId,
        targets,
        extractClosestEdge,
      );
      if (!target) return;
      const next = moveWidgetToColumn(current, activeId, target.column, target.index);
      if (next === current) return;
      write((prefs) => ({
        ...prefs,
        views: prefs.views.map((view) =>
          view.id === viewId ? { ...view, widgets: [...next] } : view,
        ),
      }));
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    return monitorForElements({
      canMonitor: ({ source }) => parseWidgetDragData(source.data) !== null,
      onDrop: ({ source, location }) => {
        const dragged = parseWidgetDragData(source.data);
        // `onDrop` também é o evento de cancelamento (Esc / soltar no vazio): sem
        // alvo, não comita nada.
        if (!dragged || location.current.dropTargets.length === 0) return;
        commit(dragged.widgetId, location.current.dropTargets);
      },
    });
  }, [open, commit]);

  const visibleCount = widgets.filter((w) => w.visible).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Personalizar «{view.name}»</SheetTitle>
          <SheetDescription>
            Escolha o que aparece, em qual coluna e em que ordem. {visibleCount} de{" "}
            {widgets.length} cards visíveis.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <TooltipProvider>
              {groups.banners.length > 0 ? (
                <section className="mb-4">
                  <h3 className="mb-1 px-1 text-xs font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
                    Faixas do topo
                  </h3>
                  <ul>
                    {groups.banners.map((widget) => {
                      const definition = getHomeWidgetDefinition(widget.id);
                      if (!definition) return null;
                      return (
                        <HomeCustomizeRow
                          key={widget.id}
                          definition={definition}
                          preference={widget}
                          canMoveUp={false}
                          canMoveDown={false}
                          canMoveLeft={false}
                          canMoveRight={false}
                          onToggle={(visible) =>
                            update((prefs) =>
                              setWidgetVisible(prefs, activeViewId, widget.id, visible),
                            )
                          }
                          onMove={() => {}}
                          onMoveSideways={() => {}}
                        />
                      );
                    })}
                  </ul>
                </section>
              ) : null}

              {groups.columns.map((column, columnIndex) => (
                <section key={columnIndex} className="mb-4 last:mb-0">
                  <h3 className="mb-1 px-1 text-xs font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
                    {COLUMN_LABEL[columnIndex] ?? `Coluna ${columnIndex + 1}`}
                  </h3>
                    <ul>
                      {column.map((widget, index) => {
                        const definition = getHomeWidgetDefinition(widget.id);
                        if (!definition) return null;
                        return (
                          <HomeCustomizeRow
                            key={widget.id}
                            definition={definition}
                            preference={widget}
                            canMoveUp={index > 0}
                            canMoveDown={index < column.length - 1}
                            canMoveLeft={columnIndex > 0}
                            canMoveRight={columnIndex < DASHBOARD_COLUMN_COUNT - 1}
                            onToggle={(visible) =>
                              update((prefs) =>
                                setWidgetVisible(prefs, activeViewId, widget.id, visible),
                              )
                            }
                            onMove={(direction) =>
                              update((prefs) =>
                                moveWidget(prefs, activeViewId, widget.id, direction),
                              )
                            }
                            onMoveSideways={(direction) =>
                              update((prefs) =>
                                moveWidgetSideways(
                                  prefs,
                                  activeViewId,
                                  widget.id,
                                  direction,
                                ),
                              )
                            }
                          />
                        );
                      })}
                      {column.length === 0 ? (
                        <li className="px-1 py-2 text-xs text-[var(--muted-foreground)]">
                          Nenhum card nesta coluna.
                        </li>
                      ) : null}
                    </ul>
                </section>
              ))}
          </TooltipProvider>
        </SheetBody>

        <SheetFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost">
                <RotateCcw className="mr-1.5 size-4" aria-hidden />
                Restaurar padrão
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Restaurar «{view.name}» ao padrão?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Os cards desta versão voltam à seleção, à coluna e à ordem
                  originais. Suas outras versões, tarefas, notas e atalhos não são
                  afetados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    update((prefs) => resetView(prefs, activeViewId));
                    toast.success(`«${view.name}» restaurada ao padrão.`);
                  }}
                >
                  Restaurar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <SheetClose asChild>
            <Button>Concluir</Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
