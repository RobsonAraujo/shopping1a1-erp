"use client";

import { useState, type CSSProperties, type Ref } from "react";
import { ChevronLeft, GripVertical, Plus, Trash2 } from "lucide-react";
import { KanbanColumnColorPicker } from "@/components/kanban/KanbanColumnColorPicker";
import { Button } from "@/components/ui/button";
import type { KanbanColumnRow } from "@/hooks/use-kanban-columns";
import { cn } from "@/lib/utils";

/**
 * Header da coluna — é também a **alça** de arrastar a coluna (quem registra o
 * `draggable` é `KanbanColumn`, pelo `dragRef`). Botões aqui dentro continuam
 * clicáveis: clique sem mover o ponteiro nunca vira `dragstart`.
 */
export function KanbanColumnHeader({
  column,
  count,
  headerStyle,
  colorId,
  onColorChange,
  onToggleCollapse,
  onRename,
  onRequestDelete,
  dragRef,
  onEditingChange,
}: {
  column: KanbanColumnRow;
  count: number;
  headerStyle?: CSSProperties;
  colorId?: string;
  onColorChange?: (colorId: string) => void;
  onToggleCollapse: () => void;
  onRename: (label: string) => void;
  onRequestDelete: () => void;
  dragRef?: Ref<HTMLElement>;
  /** Enquanto o nome é editado o header deixa de ser arrastável — um
   * `draggable="true"` em volta do input impede selecionar o texto com o mouse. */
  onEditingChange?: (editing: boolean) => void;
}) {
  const [editing, setEditingState] = useState(false);
  const [draft, setDraft] = useState(column.label);

  function setEditing(next: boolean) {
    setEditingState(next);
    onEditingChange?.(next);
  }

  function commitRename() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== column.label) onRename(trimmed);
    else setDraft(column.label);
  }

  const draggable = !column.isLocked && !editing;

  return (
    <header
      ref={dragRef}
      style={headerStyle}
      aria-label={draggable ? `Arrastar coluna ${column.label}` : undefined}
      className={cn(
        "border-b border-[var(--border)] px-3 py-2.5",
        draggable && "cursor-grab active:cursor-grabbing",
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
              aria-label="Nome da coluna"
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
              onDoubleClick={() => {
                setDraft(column.label);
                setEditing(true);
              }}
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

export function KanbanAddColumn({ onAdd }: { onAdd: (label: string) => void }) {
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
        aria-label="Nome da nova coluna"
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
