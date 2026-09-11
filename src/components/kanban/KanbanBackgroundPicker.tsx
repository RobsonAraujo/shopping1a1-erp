"use client";

import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  KANBAN_BACKGROUND_GROUPS,
  KANBAN_BACKGROUNDS,
} from "@/lib/kanban/kanban-backgrounds";
import { cn } from "@/lib/utils";

export function KanbanBackgroundPicker({
  background,
  onChange,
}: {
  /** CSS `background` atual (cor sólida, gradiente, ou "" = padrão do app). */
  background: string;
  onChange: (value: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 max-sm:size-9 max-sm:px-0"
          aria-label="Cor do fundo"
        >
          <Palette className="size-4" aria-hidden />
          <span className="hidden sm:inline">Cor do fundo</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 max-w-[calc(100vw-1.5rem)] p-3">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          Cor do quadro
        </p>
        <div className="flex flex-col gap-3">
          {KANBAN_BACKGROUND_GROUPS.map((group) => {
            const options = KANBAN_BACKGROUNDS.filter((option) => option.group === group.id);
            return (
              <div key={group.id}>
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                  {group.label}
                </p>
                <div className="grid grid-cols-6 gap-1.5">
                  {options.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => onChange(option.value)}
                      aria-label={option.label}
                      title={option.label}
                      className={cn(
                        "flex size-8 cursor-pointer items-center justify-center rounded-md border border-[var(--border)] transition-transform hover:scale-105",
                        option.id === "default" && "bg-[var(--muted)]",
                      )}
                      style={option.value ? { background: option.value } : undefined}
                    >
                      {background === option.value ? (
                        <Check
                          className={cn(
                            "size-4",
                            option.id === "default"
                              ? "text-[var(--foreground)]"
                              : "text-black/60 drop-shadow-sm",
                          )}
                          aria-hidden
                        />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
