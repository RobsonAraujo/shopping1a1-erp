"use client";

import { useState, type CSSProperties } from "react";
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
import type { SupplierBoardCard } from "@/lib/compras/supplier-board";
import { SupplierPurchaseKanbanCard } from "@/components/compras/SupplierPurchaseKanbanCard";
import { useDropHighlight } from "@/hooks/use-drop-highlight";
import type {
  DeleteColumnResult,
  KanbanColumnRow,
} from "@/hooks/use-kanban-columns";
import { useKanbanAppearance } from "@/hooks/use-kanban-appearance";
import { KanbanColumnColorPicker } from "@/components/kanban/KanbanColumnColorPicker";
import { columnColorIdFor, resolveKanbanColumnPaint } from "@/lib/kanban/kanban-column-colors";
import type { OperationCycleKind } from "@/generated/prisma/client";
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

export const COLUMN_DROP_ID_PREFIX = "column:";
export const COLUMN_DRAG_ID_PREFIX = "colhdr:";

type SupplierPurchaseKanbanBoardProps = {
  cards: SupplierBoardCard[];
  busySupplier: string | null;
  columns: KanbanColumnRow[];
  onRenameColumn: (id: string, label: string) => void | Promise<void>;
  onAddColumn: (label: string) => void | Promise<void>;
  onDeleteColumn: (
    id: string,
    moveCardsToColumnId?: string,
  ) => Promise<DeleteColumnResult>;
  onToggleCollapse: (id: string, isCollapsed: boolean) => void | Promise<void>;
  kind: OperationCycleKind;
  /** CSS `background` (cor sólida ou gradiente) escolhido pelo usuário —
   * vazio/undefined = sem cor (fundo padrão do app). */
  background?: string;
  /** Modo "tela cheia" (estilo Trello): colunas ocupam a altura total
   * disponível e rolam verticalmente por dentro, em vez de esticar a página. */
  fullHeight?: boolean;
};

function DroppableColumn({
  columnId,
  collapsed,
  fullHeight,
  stripe,
  shellStyle,
  children,
}: {
  columnId: string;
  collapsed: boolean;
  fullHeight?: boolean;
  stripe?: string;
  shellStyle?: CSSProperties;
  children: React.ReactNode;
}) {
  const { setNodeRef, className } = useDropHighlight(
    `${COLUMN_DROP_ID_PREFIX}${columnId}`,
  );
  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex shrink-0 snap-center flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[rgb(255_255_255_/_65%)] shadow-sm sm:snap-align-none",
        collapsed ? "w-10 self-start sm:w-10" : "w-[calc(100vw-2.75rem)] sm:w-72",
        fullHeight && !collapsed && "h-full",
        className,
      )}
      style={shellStyle}
    >
      {stripe ? (
        <div aria-hidden className="h-1.5 shrink-0" style={{ background: stripe }} />
      ) : null}
      {children}
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
}: {
  column: KanbanColumnRow;
  count: number;
  headerStyle?: CSSProperties;
  colorId?: string;
  onColorChange?: (colorId: string) => void;
  onToggleCollapse: () => void;
  onRename: (label: string) => void;
  onRequestDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(column.label);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${COLUMN_DRAG_ID_PREFIX}${column.id}`,
    disabled: column.isLocked,
  });

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== column.label) onRename(trimmed);
    else setDraft(column.label);
  }

  return (
    <header
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...headerStyle,
      }}
      className={cn(
        "border-b border-[var(--border)] px-3 py-2.5",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {!column.isLocked ? (
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="cursor-grab touch-none text-[var(--muted-foreground)] active:cursor-grabbing"
              aria-label={`Arrastar coluna ${column.label}`}
            >
              <GripVertical className="size-3.5" aria-hidden />
            </button>
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
              className="min-w-0 rounded border border-[var(--border)] bg-[var(--background)] px-1.5 py-0.5 text-sm font-semibold"
            />
          ) : (
            <h3
              className="cursor-text truncate text-sm font-semibold"
              onDoubleClick={() => setEditing(true)}
              title="Duplo clique para renomear"
            >
              {column.label}
            </h3>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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

export function SupplierPurchaseKanbanBoard({
  cards,
  busySupplier,
  columns,
  onRenameColumn,
  onAddColumn,
  onDeleteColumn,
  onToggleCollapse,
  kind,
  background,
  fullHeight,
}: SupplierPurchaseKanbanBoardProps) {
  const { appearance, setColumnColor } = useKanbanAppearance(kind);
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

  const cardsByColumnId = new Map<string, SupplierBoardCard[]>();
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

  return (
    <>
      <div
        className={cn(
          "flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain sm:snap-none",
          fullHeight
            ? "min-h-0 flex-1 px-3 pb-3 sm:px-4 sm:pb-12 kanban-scroll-x"
            : "rounded-2xl p-3 max-sm:-mx-4 max-sm:rounded-none max-sm:px-4",
        )}
        style={!fullHeight && background ? { background } : undefined}
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
                columnId={column.id}
                collapsed={isCollapsed}
                fullHeight={fullHeight}
                stripe={paint.stripe}
                shellStyle={paint.shellStyle}
              >
                {isCollapsed ? (
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
                          <SupplierPurchaseKanbanCard
                            key={card.supplier}
                            card={card}
                            busy={busySupplier === card.supplier}
                          />
                        ))
                      )}
                    </div>
                  </>
                )}
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
    </>
  );
}
