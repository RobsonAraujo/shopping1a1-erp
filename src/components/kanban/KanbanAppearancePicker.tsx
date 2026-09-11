"use client";

import { Check, Paintbrush } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useKanbanAppearance } from "@/hooks/use-kanban-appearance";
import type { OperationCycleKind } from "@/generated/prisma/client";
import {
  KANBAN_COLOR_MODES,
  KANBAN_COLUMN_COLORS,
  KANBAN_COLUMN_THEMES,
  KANBAN_STAGE_RAMP,
  getKanbanColumnColor,
  type KanbanColumnTheme,
} from "@/lib/kanban/kanban-column-colors";
import { cn } from "@/lib/utils";

function ThemePreview({ theme, solidColor }: { theme: KanbanColumnTheme; solidColor: string }) {
  const bars =
    theme === "default"
      ? ["#d8dce3", "#d8dce3", "#d8dce3"]
      : theme === "solid"
        ? [
            getKanbanColumnColor(solidColor)?.accent ?? "#5b9bd5",
            getKanbanColumnColor(solidColor)?.accent ?? "#5b9bd5",
            getKanbanColumnColor(solidColor)?.accent ?? "#5b9bd5",
          ]
        : KANBAN_STAGE_RAMP.slice(0, 3).map(
            (id) => getKanbanColumnColor(id)?.accent ?? "#5b9bd5",
          );

  return (
    <span className="flex h-8 w-full items-end justify-center gap-0.5 px-1" aria-hidden>
      {bars.map((color, index) => (
        <span
          key={index}
          className="h-6 flex-1 rounded-sm"
          style={{ background: color }}
        />
      ))}
    </span>
  );
}

export function KanbanAppearancePicker({
  kind,
}: {
  kind: OperationCycleKind;
}) {
  const { appearance, setTheme, setSolidColor, setColorMode } = useKanbanAppearance(kind);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 max-sm:size-9 max-sm:px-0"
          aria-label="Aparência das colunas"
        >
          <Paintbrush className="size-4" aria-hidden />
          <span className="hidden sm:inline">Colunas</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 max-w-[calc(100vw-1.5rem)] p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Estilo das colunas
        </p>
        <p className="mt-1 mb-3 text-[11px] leading-snug text-[var(--muted-foreground)]">
          Protótipo neste navegador — ainda não é compartilhado com a equipe.
        </p>

        <div className="grid grid-cols-3 gap-1.5">
          {KANBAN_COLUMN_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => setTheme(theme.id)}
              className={cn(
                "cursor-pointer rounded-lg border p-1.5 text-left transition-colors",
                appearance.theme === theme.id
                  ? "border-[var(--foreground)] bg-[var(--muted)]"
                  : "border-[var(--border)] hover:border-[var(--foreground)]",
              )}
            >
              <ThemePreview theme={theme.id} solidColor={appearance.solidColor} />
              <span className="mt-1 block text-center text-[11px] font-medium">
                {theme.label}
              </span>
              <span className="block text-center text-[10px] text-[var(--muted-foreground)]">
                {theme.hint}
              </span>
            </button>
          ))}
        </div>

        {appearance.theme === "solid" ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Cor
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {KANBAN_COLUMN_COLORS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSolidColor(option.id)}
                  aria-label={option.label}
                  title={option.label}
                  className="flex size-7 cursor-pointer items-center justify-center rounded-md border border-black/10"
                  style={{ background: option.accent }}
                >
                  {appearance.solidColor === option.id ? (
                    <Check className="size-3.5 text-white drop-shadow-sm" aria-hidden />
                  ) : null}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {appearance.theme !== "default" ? (
          <div className="mt-3">
            <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
              Como aplicar
            </p>
            <div className="grid grid-cols-3 gap-1">
              {KANBAN_COLOR_MODES.map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => setColorMode(mode.id)}
                  className={cn(
                    "cursor-pointer rounded-md border px-1.5 py-1 text-[11px] font-medium transition-colors",
                    appearance.colorMode === mode.id
                      ? "border-[var(--foreground)] bg-[var(--muted)] text-[var(--foreground)]"
                      : "border-[var(--border)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                  )}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
