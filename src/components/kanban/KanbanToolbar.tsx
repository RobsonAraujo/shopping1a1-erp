"use client";

import type { ComponentProps, ReactNode } from "react";
import { Maximize2, RefreshCw } from "lucide-react";
import { KanbanAppearancePicker } from "@/components/kanban/KanbanAppearancePicker";
import { KanbanBackgroundPicker } from "@/components/kanban/KanbanBackgroundPicker";
import { ItemListSearch } from "@/components/shared/ItemListSearch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Barra de ações dos Kanbans (Compras e Operações Full): busca à esquerda;
 * à direita o slot `extra` da página, fundo, aparência, Sincronizar e Tela
 * cheia.
 */
export function KanbanToolbar({
  search,
  extra,
  background,
  onBackgroundChange,
  appearance,
  setTheme,
  setSolidColor,
  setColorMode,
  syncing,
  syncDisabled,
  onSync,
  isFullscreen,
  onEnterFullscreen,
}: {
  search: Omit<ComponentProps<typeof ItemListSearch>, "className">;
  extra?: ReactNode;
  background: string;
  onBackgroundChange: (value: string) => void;
  appearance: ComponentProps<typeof KanbanAppearancePicker>["appearance"];
  setTheme: ComponentProps<typeof KanbanAppearancePicker>["setTheme"];
  setSolidColor: ComponentProps<typeof KanbanAppearancePicker>["setSolidColor"];
  setColorMode: ComponentProps<typeof KanbanAppearancePicker>["setColorMode"];
  /** Sincronização manual em curso (gira o ícone). */
  syncing: boolean;
  /** Também desabilita enquanto o resync em background ainda roda — duas
   * varreduras do Mercado Livre ao mesmo tempo só dobram o custo. */
  syncDisabled: boolean;
  onSync: () => void;
  isFullscreen: boolean;
  onEnterFullscreen: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
      <ItemListSearch className="max-sm:w-full" {...search} />
      <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto sm:gap-2">
        {extra}
        <KanbanBackgroundPicker background={background} onChange={onBackgroundChange} />
        <KanbanAppearancePicker
          appearance={appearance}
          setTheme={setTheme}
          setSolidColor={setSolidColor}
          setColorMode={setColorMode}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-2 max-sm:size-9 max-sm:px-0"
          disabled={syncDisabled}
          onClick={onSync}
          aria-label="Sincronizar"
          title={syncDisabled && !syncing ? "Atualizando vendas…" : undefined}
        >
          <RefreshCw className={cn("size-4", syncDisabled && "animate-spin")} aria-hidden />
          <span className="hidden sm:inline">Sincronizar</span>
        </Button>
        {!isFullscreen ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 max-sm:size-9 max-sm:px-0"
            onClick={onEnterFullscreen}
            aria-label="Tela cheia"
          >
            <Maximize2 className="size-4" aria-hidden />
            <span className="hidden sm:inline">Tela cheia</span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
