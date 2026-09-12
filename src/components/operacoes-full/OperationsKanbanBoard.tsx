"use client";

import { useCallback, useState, type CSSProperties } from "react";
import {
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  SortableContext,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { OperationsKanbanCard } from "@/components/operacoes-full/OperationsKanbanCard";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";
import { useDropHighlight } from "@/hooks/use-drop-highlight";
import { useKanbanPanScroll } from "@/hooks/use-kanban-pan-scroll";
import type {
  DeleteColumnResult,
  KanbanColumnRow,
} from "@/hooks/use-kanban-columns";
import { KanbanColumnColorPicker } from "@/components/kanban/KanbanColumnColorPicker";
import {
  columnColorIdFor,
  resolveKanbanColumnPaint,
  type KanbanAppearance,
} from "@/lib/kanban/kanban-column-colors";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserFeedback } from "@/components/ui/user-feedback";
import { cn } from "@/lib/utils";

export const OPERATIONS_COLUMN_DROP_ID_PREFIX = "column:";
export const COLUMN_DRAG_ID_PREFIX = "colhdr:";

type OperationsKanbanBoardProps = {
  cards: OperationsBoardCard[];
  busyId: string | null;
  title?: string;
  description?: string;
  columns: KanbanColumnRow[];
  onRenameColumn: (id: string, label: string) => void | Promise<void>;
  onAddColumn: (label: string) => void | Promise<void>;
  onDeleteColumn: (
    id: string,
    moveCardsToColumnId?: string,
  ) => Promise<DeleteColumnResult>;
  onToggleCollapse: (id: string, isCollapsed: boolean) => void | Promise<void>;
  appearance: KanbanAppearance;
  setColumnColor: (columnId: string, colorId: string) => void;
  /** CSS `background` (cor sólida ou gradiente) escolhido pelo usuário —
   * vazio/undefined = sem cor (fundo padrão do app). */
  background?: string;
  /** Modo "tela cheia" (estilo Trello): colunas ocupam a altura total
   * disponível e rolam verticalmente por dentro, em vez de esticar a página. */
  fullHeight?: boolean;
};

type ColumnDragHandle = Pick<
  ReturnType<typeof useSortable>,
  "attributes" | "listeners"
> & { isDragging: boolean };

function DroppableColumn({
  column,
  collapsed,
  fullHeight,
  stripe,
  shellStyle,
  children,
}: {
  column: KanbanColumnRow;
  collapsed: boolean;
  fullHeight?: boolean;
  stripe?: string;
  shellStyle?: CSSProperties;
  children: (drag: ColumnDragHandle) => React.ReactNode;
}) {
  const { setNodeRef: setDropRef, className } = useDropHighlight(
    `${OPERATIONS_COLUMN_DROP_ID_PREFIX}${column.id}`,
  );
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${COLUMN_DRAG_ID_PREFIX}${column.id}`,
    disabled: column.isLocked,
  });
  const setNodeRef = useCallback(
    (node: HTMLElement | null) => {
      setDropRef(node);
      setSortableRef(node);
    },
    [setDropRef, setSortableRef],
  );

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex shrink-0 snap-center flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[rgb(255_255_255_/_65%)] shadow-sm sm:snap-align-none",
        collapsed ? "w-10 self-start sm:w-10" : "w-[calc(100vw-2.75rem)] sm:w-72",
        fullHeight && !collapsed && "self-start max-h-full",
        isDragging && "opacity-60",
        className,
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...shellStyle,
      }}
    >
      {stripe ? (
        <div aria-hidden className="h-1.5 shrink-0" style={{ background: stripe }} />
      ) : null}
      {children({ attributes, listeners, isDragging })}
    </section>
  );
}

function ColumnHeader({
  column,
  count,
  headerStyle,
  colorId,
  onColorChange,
  onToggleCollapse,
  onRename,
  onRequestDelete,
  drag,
}: {
  column: KanbanColumnRow;
  count: number;
  headerStyle?: CSSProperties;
  colorId?: string;
  onColorChange?: (colorId: string) => void;
  onToggleCollapse: () => void;
  onRename: (label: string) => void;
  onRequestDelete: () => void;
  drag: ColumnDragHandle;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.label);

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== column.label) onRename(trimmed);
    else setDraft(column.label);
  }

  return (
    <header
      {...(!column.isLocked ? drag.attributes : undefined)}
      {...(!column.isLocked ? drag.listeners : undefined)}
      style={headerStyle}
      aria-label={!column.isLocked ? `Arrastar coluna ${column.label}` : undefined}
      className={cn(
        "border-b border-[var(--border)] px-3 py-2.5",
        !column.isLocked && "touch-none",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {!column.isLocked ? (
            <GripVertical
              className="size-3.5 shrink-0 text-[var(--muted-foreground)]"
              aria-hidden
            />
          ) : null}
          {editing ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setDraft(column.label);
                  setEditing(false);
                }
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className="min-w-0 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-sm font-semibold"
            />
          ) : (
            <h3
              className="cursor-text truncate text-sm font-semibold"
              onDoubleClick={() => setEditing(true)}
              onPointerDown={(e) => e.stopPropagation()}
              title="Duplo clique para renomear"
            >
              {column.label}
            </h3>
          )}
        </div>
        <div
          className="flex shrink-0 items-center gap-1.5"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {onColorChange ? (
            <KanbanColumnColorPicker
              colorId={colorId}
              columnLabel={column.label}
              onChange={onColorChange}
            />
          ) : null}
          <span className="rounded-full bg-[var(--muted)] px-2 py-0.5 text-xs tabular-nums">
            {count}
          </span>
          {!column.isLocked ? (
            <button
              type="button"
              onClick={onRequestDelete}
              aria-label={`Excluir coluna ${column.label}`}
              className="cursor-pointer text-[var(--muted-foreground)] transition-colors hover:text-rose-600"
            >
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={`Recolher coluna ${column.label}`}
            className="cursor-pointer text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}

function AddColumnAffordance({ onAdd }: { onAdd: (label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-11 w-40 shrink-0 cursor-pointer items-center justify-center gap-1.5 self-start rounded-xl border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)] transition-colors hover:border-[var(--foreground)] hover:text-[var(--foreground)]"
      >
        <Plus className="size-4" aria-hidden />
        Adicionar coluna
      </button>
    );
  }

  function commit() {
    const trimmed = value.trim();
    if (trimmed) onAdd(trimmed);
    setValue("");
    setOpen(false);
  }

  return (
    <div className="flex h-11 w-40 shrink-0 items-center gap-1 self-start rounded-xl border border-[var(--border)] bg-[var(--card)] px-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setValue("");
            setOpen(false);
          }
        }}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        placeholder="Nome da coluna"
        className="min-w-0 flex-1 bg-transparent text-sm outline-none"
      />
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        onClick={commit}
        aria-label="Confirmar nova coluna"
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </div>
  );
}

export function OperationsKanbanBoard({
  title,
  description,
  cards,
  busyId,
  columns,
  onRenameColumn,
  onAddColumn,
  onDeleteColumn,
  onToggleCollapse,
  appearance,
  setColumnColor,
  background,
  fullHeight,
}: OperationsKanbanBoardProps) {
  const [pendingDelete, setPendingDelete] = useState<{
    column: KanbanColumnRow;
    cardCount: number;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sortedColumns = [...columns].sort((a, b) => a.position - b.position);
  const columnIds = sortedColumns.map((c) => c.id);
  const middleColumnDragIds = sortedColumns
    .filter((c) => !c.isLocked)
    .map((c) => `${COLUMN_DRAG_ID_PREFIX}${c.id}`);

  const cardsByColumnId = new Map<string, OperationsBoardCard[]>();
  for (const column of sortedColumns) cardsByColumnId.set(column.id, []);
  for (const card of cards) {
    cardsByColumnId.get(card.columnId)?.push(card);
  }

  function requestDelete(column: KanbanColumnRow) {
    setDeleteError(null);
    setDeleteTarget("");
    setPendingDelete({
      column,
      cardCount: cardsByColumnId.get(column.id)?.length ?? 0,
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    if (pendingDelete.cardCount > 0 && !deleteTarget) return;
    const result = await onDeleteColumn(
      pendingDelete.column.id,
      pendingDelete.cardCount > 0 ? deleteTarget : undefined,
    );
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setPendingDelete(null);
  }

  const otherColumnOptions = pendingDelete
    ? sortedColumns
        .filter((c) => c.id !== pendingDelete.column.id)
        .map((c) => ({ value: c.id, label: c.label }))
    : [];

  const panScroll = useKanbanPanScroll();

  return (
    <section
      className={cn(
        fullHeight
          ? "flex min-h-0 flex-1 flex-col gap-3 overflow-hidden"
          : "space-y-3 rounded-2xl p-3 max-sm:-mx-4 max-sm:rounded-none max-sm:px-4",
      )}
      style={!fullHeight && background ? { background } : undefined}
    >
      {title ? (
        <div>
          <h2 className="text-xl font-semibold text-[var(--primary)]">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted-foreground)]">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain sm:snap-none",
          fullHeight
            ? "min-h-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-12 kanban-scroll-x"
            : "pb-2",
        )}
        {...panScroll}
      >
        <SortableContext
          items={middleColumnDragIds}
          strategy={horizontalListSortingStrategy}
        >
          {sortedColumns.map((column) => {
            const columnCards = cardsByColumnId.get(column.id) ?? [];
            const isCollapsed = column.isCollapsed;
            const colorId = columnColorIdFor(appearance, column.id, columnIds);
            const paint = resolveKanbanColumnPaint(colorId, appearance.colorMode);
            return (
              <DroppableColumn
                key={column.id}
                column={column}
                collapsed={isCollapsed}
                fullHeight={fullHeight}
                stripe={paint.stripe}
                shellStyle={paint.shellStyle}
              >
                {(drag) =>
                  isCollapsed ? (
                    <button
                      type="button"
                      onClick={() => void onToggleCollapse(column.id, false)}
                      aria-label={`Expandir coluna ${column.label}`}
                      className="flex h-64 cursor-pointer flex-col items-center justify-between gap-2 py-3 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                    >
                      <ChevronRight className="size-4 shrink-0" aria-hidden />
                      <span className="flex-1 text-sm font-semibold [writing-mode:vertical-rl]">
                        {column.label}
                      </span>
                      <span className="rounded-full bg-[var(--muted)] px-1.5 py-0.5 text-xs tabular-nums">
                        {columnCards.length}
                      </span>
                    </button>
                  ) : (
                    <>
                      <ColumnHeader
                        column={column}
                        count={columnCards.length}
                        headerStyle={paint.headerStyle}
                        colorId={colorId}
                        onColorChange={
                          appearance.theme === "colorful"
                            ? (next) => setColumnColor(column.id, next)
                            : undefined
                        }
                        onToggleCollapse={() =>
                          void onToggleCollapse(column.id, true)
                        }
                        onRename={(label) =>
                          void onRenameColumn(column.id, label)
                        }
                        onRequestDelete={() => requestDelete(column)}
                        drag={drag}
                      />
                      <div
                        className={cn(
                          "flex flex-1 flex-col gap-2 p-2",
                          fullHeight && "min-h-0 overflow-y-auto",
                        )}
                      >
                        {columnCards.length === 0 ? (
                          <p className="px-1 py-6 text-center text-xs text-[var(--muted-foreground)]">
                            Vazio
                          </p>
                        ) : (
                          columnCards.map((card) => (
                            <OperationsKanbanCard
                              key={card.cycleId}
                              card={card}
                              busy={busyId === card.cycleId}
                            />
                          ))
                        )}
                      </div>
                    </>
                  )
                }
              </DroppableColumn>
            );
          })}
        </SortableContext>
        <AddColumnAffordance onAdd={(label) => void onAddColumn(label)} />
      </div>

      <AlertDialog
        open={pendingDelete != null}
        onOpenChange={(next) => !next && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Excluir coluna &quot;{pendingDelete?.column.label}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.cardCount > 0
                ? `Essa coluna tem ${pendingDelete.cardCount} card${pendingDelete.cardCount === 1 ? "" : "s"}. Escolha para qual coluna movê-los antes de excluir.`
                : "Essa coluna está vazia — pode excluir sem afetar nenhum card."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingDelete && pendingDelete.cardCount > 0 ? (
            <FormSelect
              label="Mover cards para"
              value={deleteTarget}
              onValueChange={setDeleteTarget}
              options={otherColumnOptions}
              placeholder="Selecione a coluna de destino"
            />
          ) : null}
          {deleteError ? <UserFeedback>{deleteError}</UserFeedback> : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={Boolean(
                pendingDelete && pendingDelete.cardCount > 0 && !deleteTarget,
              )}
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
