"use client";

import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { RotateCcw } from "lucide-react";
import { useCallback, useMemo } from "react";
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
  moveWidget,
  reorderWidgets,
  resetDashboardPreferences,
  setWidgetSize,
  setWidgetVisible,
} from "@/lib/home/dashboard/dashboard-preferences";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import {
  HOME_WIDGET_CATEGORY_LABEL,
  HOME_WIDGET_CATEGORY_ORDER,
  getHomeWidgetDefinition,
  type HomeWidgetCategory,
} from "@/lib/home/dashboard/widget-registry";

/**
 * "Personalizar início". Mudança aplica na hora — não há Salvar/Cancelar
 * porque o destino é `localStorage` e não existe o que dar errado no meio.
 *
 * Reordenar acontece **dentro de cada categoria**: mantém cada
 * `SortableContext` numa lista de eixo único (o caso que o dnd-kit resolve
 * bem), e a ordem entre categorias já vem do registry.
 */
export function HomeCustomizeSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { widgets, update } = useHomeLayout();
  const sensors = useDndSensors();

  const grouped = useMemo(() => {
    const byCategory = new Map<
      HomeWidgetCategory,
      { id: string; definitionId: string }[]
    >();
    for (const widget of widgets) {
      const definition = getHomeWidgetDefinition(widget.id);
      if (!definition) continue;
      const list = byCategory.get(definition.category) ?? [];
      list.push({ id: widget.id, definitionId: definition.id });
      byCategory.set(definition.category, list);
    }
    return HOME_WIDGET_CATEGORY_ORDER.flatMap((category) => {
      const items = byCategory.get(category);
      return items ? [{ category, items }] : [];
    });
  }, [widgets]);

  const onDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeId = String(event.active.id);
      const overId = event.over ? String(event.over.id) : null;
      if (!overId || overId === activeId) return;

      const allIds = widgets.map((w) => w.id);
      const from = allIds.indexOf(activeId);
      const to = allIds.indexOf(overId);
      if (from === -1 || to === -1) return;
      update((prefs) => reorderWidgets(prefs, arrayMove(allIds, from, to)));
    },
    [widgets, update],
  );

  const visibleCount = widgets.filter((w) => w.visible).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Personalizar início</SheetTitle>
          <SheetDescription>
            Escolha o que aparece, o tamanho e a ordem. {visibleCount} de{" "}
            {widgets.length} cards visíveis.
          </SheetDescription>
        </SheetHeader>

        <SheetBody>
          <TooltipProvider>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
              accessibility={{
                screenReaderInstructions: {
                  draggable:
                    "Pressione espaço ou enter para começar a mover o card. Use as setas para escolher a nova posição, espaço ou enter para soltar e escape para cancelar.",
                },
              }}
            >
              {grouped.map(({ category, items }) => (
                <section key={category} className="mb-4 last:mb-0">
                  <h3 className="mb-1 px-1 text-xs font-semibold tracking-wide text-[var(--muted-foreground)] uppercase">
                    {HOME_WIDGET_CATEGORY_LABEL[category]}
                  </h3>
                  <SortableContext
                    items={items.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <ul>
                      {items.map((item, index) => {
                        const definition = getHomeWidgetDefinition(
                          item.definitionId,
                        );
                        const preference = widgets.find(
                          (w) => w.id === item.id,
                        );
                        if (!definition || !preference) return null;
                        return (
                          <HomeCustomizeRow
                            key={item.id}
                            definition={definition}
                            preference={preference}
                            canMoveUp={index > 0}
                            canMoveDown={index < items.length - 1}
                            onToggle={(visible) =>
                              update((prefs) =>
                                setWidgetVisible(prefs, item.id, visible),
                              )
                            }
                            onResize={(size) =>
                              update((prefs) =>
                                setWidgetSize(prefs, item.id, size),
                              )
                            }
                            onMove={(direction) =>
                              update((prefs) =>
                                moveWidget(prefs, item.id, direction),
                              )
                            }
                          />
                        );
                      })}
                    </ul>
                  </SortableContext>
                </section>
              ))}
            </DndContext>
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
                <AlertDialogTitle>Restaurar o início padrão?</AlertDialogTitle>
                <AlertDialogDescription>
                  Os cards voltam à seleção, ao tamanho e à ordem originais.
                  Suas tarefas, notas e atalhos não são apagados.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    update(resetDashboardPreferences());
                    toast.success("Início restaurado ao padrão.");
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
