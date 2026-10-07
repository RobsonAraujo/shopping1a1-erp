"use client";

import { useState } from "react";
import { ArrowDownToLine, ArrowRight, ArrowUpToLine, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { KanbanColumnRow } from "@/hooks/use-kanban-columns";

export type KanbanCardMenuAction =
  | { type: "top" }
  | { type: "bottom" }
  | { type: "column"; columnId: string };

/**
 * Alternativa ao arrasto, no próprio card (estilo "Mover" do Trello).
 *
 * O Pragmatic drag and drop **não faz arrasto por teclado** — é decisão de
 * projeto deles: a diretriz de acessibilidade pede alternativas ao arrastar
 * com botões e menus. Também é o caminho mais confortável no celular, onde
 * arrastar exige pressionar e segurar.
 *
 * Aparece no hover/foco do card (`group/card`) e fica sempre visível em
 * telas sem hover (toque).
 */
export function KanbanCardMenu({
  cardLabel,
  columns,
  currentColumnId,
  isFirst,
  isLast,
  onAction,
}: {
  cardLabel: string;
  /** Todas as colunas, já na ordem do board. */
  columns: readonly KanbanColumnRow[];
  currentColumnId: string;
  isFirst: boolean;
  isLast: boolean;
  onAction: (action: KanbanCardMenuAction) => void;
}) {
  const [open, setOpen] = useState(false);

  function run(action: KanbanCardMenuAction) {
    setOpen(false);
    onAction(action);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Mover ${cardLabel}`}
          className="size-7 bg-[var(--card)]/90 text-[var(--muted-foreground)] opacity-0 shadow-sm transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60 p-1" align="end">
        <p className="truncate px-2 py-1.5 text-xs font-medium text-[var(--muted-foreground)]">
          {cardLabel}
        </p>
        <ul>
          <li>
            <Button
              variant="ghost"
              size="sm"
              disabled={isFirst}
              onClick={() => run({ type: "top" })}
              className="w-full justify-start"
            >
              <ArrowUpToLine className="mr-2 size-4" aria-hidden />
              Mover para o topo
            </Button>
          </li>
          <li>
            <Button
              variant="ghost"
              size="sm"
              disabled={isLast}
              onClick={() => run({ type: "bottom" })}
              className="w-full justify-start"
            >
              <ArrowDownToLine className="mr-2 size-4" aria-hidden />
              Mover para o fim
            </Button>
          </li>
        </ul>
        <p className="mt-1 border-t border-[var(--border)] px-2 pt-2 pb-1 text-xs font-medium text-[var(--muted-foreground)]">
          Mover para a coluna
        </p>
        <ul>
          {columns.map((column) => (
            <li key={column.id}>
              <Button
                variant="ghost"
                size="sm"
                disabled={column.id === currentColumnId}
                onClick={() => run({ type: "column", columnId: column.id })}
                className="w-full justify-start"
              >
                <ArrowRight className="mr-2 size-4 shrink-0" aria-hidden />
                <span className="truncate">{column.label}</span>
              </Button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
