"use client";

import { Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { KANBAN_COLUMN_COLORS, getKanbanColumnColor } from "@/lib/kanban/kanban-column-colors";
import { cn } from "@/lib/utils";

export function KanbanColumnColorPicker({
  colorId,
  onChange,
  columnLabel,
}: {
  colorId?: string;
  onChange: (colorId: string) => void;
  columnLabel: string;
}) {
  const current = getKanbanColumnColor(colorId);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Cor da coluna ${columnLabel}`}
          title="Cor da coluna"
          className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)]"
          style={current ? { background: current.accent, borderColor: current.accent } : undefined}
        />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-48 p-2">
        <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          Cor da coluna
        </p>
        <div className="grid grid-cols-6 gap-1.5">
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Padrão"
            title="Padrão"
            className="flex size-6 cursor-pointer items-center justify-center rounded-full border border-[var(--border)] bg-[var(--muted)]"
          >
            {!colorId ? (
              <Check className="size-3 text-[var(--foreground)]" aria-hidden />
            ) : null}
          </button>
          {KANBAN_COLUMN_COLORS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => onChange(option.id)}
              aria-label={option.label}
              title={option.label}
              className={cn(
                "flex size-6 cursor-pointer items-center justify-center rounded-full border border-black/10",
              )}
              style={{ background: option.accent }}
            >
              {colorId === option.id ? (
                <Check className="size-3 text-white drop-shadow-sm" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
