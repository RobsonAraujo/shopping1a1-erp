"use client";

import { useCallback, useEffect, useState } from "react";
import type { OperationCycleKind } from "@/generated/prisma/client";
import { readApiError } from "@/lib/api/api-client-error";
import {
  isDefaultKanbanAppearance,
  kanbanAppearanceStorageKey,
  parseKanbanAppearance,
  withKanbanColorMode,
  withKanbanColumnColor,
  withKanbanSolidColor,
  withKanbanTheme,
  type KanbanAppearance,
  type KanbanColumnColorMode,
  type KanbanColumnTheme,
} from "@/lib/kanban/kanban-column-colors";

export type KanbanColumnRow = {
  id: string;
  kind: OperationCycleKind;
  label: string;
  position: number;
  isLocked: boolean;
  isCollapsed: boolean;
};

export type DeleteColumnResult =
  | { ok: true }
  | { ok: false; code?: string; error: string };

export type KanbanBoardInitialData = {
  columns: KanbanColumnRow[];
  background: string;
  isFullscreen: boolean;
  appearance: KanbanAppearance;
};

/**
 * Colunas + fundo + tela cheia + aparência das colunas do Kanban (Compras
 * ou Operações Full) — tudo compartilhado pela organização e persistido no
 * banco (igual a um board no Trello). Semeado com `initial` (já carregado
 * no servidor, ver `page.tsx` de cada board) em vez de buscar num
 * `useEffect` — sem isso a página nasce com o estado "vazio"/padrão e só
 * corrige depois de montar, um "piscar" visível especialmente incômodo pra
 * coluna colapsada (aparece expandida por um instante e depois encolhe).
 */
export function useKanbanBoard(kind: OperationCycleKind, initial: KanbanBoardInitialData) {
  const [columns, setColumns] = useState<KanbanColumnRow[]>(initial.columns);
  const [background, setBackgroundState] = useState<string>(initial.background);
  const [isFullscreen, setIsFullscreenState] = useState<boolean>(initial.isFullscreen);
  const [appearance, setAppearanceState] = useState<KanbanAppearance>(initial.appearance);
  const [error, setError] = useState<string | null>(null);

  const reloadColumns = useCallback(async () => {
    try {
      const res = await fetch(`/api/kanban-columns?kind=${kind}`);
      if (!res.ok) return;
      const json = (await res.json()) as { columns: KanbanColumnRow[] };
      setColumns(json.columns);
    } catch {
      // silencioso — a próxima ação do usuário (ou um reload manual da
      // página) tenta de novo; não vale a pena um estado de erro pra isso.
    }
  }, [kind]);

  const rename = useCallback(
    async (id: string, label: string) => {
      const previous = columns;
      setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
      try {
        const res = await fetch(`/api/kanban-columns/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label }),
        });
        if (!res.ok) {
          setColumns(previous);
          setError(await readApiError(res, "kanban_column_update_failed"));
        }
      } catch {
        setColumns(previous);
        setError("Falha de rede ao renomear coluna.");
      }
    },
    [columns],
  );

  const toggleCollapse = useCallback(
    async (id: string, isCollapsed: boolean) => {
      const previous = columns;
      setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, isCollapsed } : c)));
      try {
        const res = await fetch(`/api/kanban-columns/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isCollapsed }),
        });
        if (!res.ok) {
          setColumns(previous);
          setError(await readApiError(res, "kanban_column_update_failed"));
        }
      } catch {
        setColumns(previous);
        setError("Falha de rede ao atualizar coluna.");
      }
    },
    [columns],
  );

  const addColumn = useCallback(
    async (label: string) => {
      setError(null);
      try {
        const res = await fetch("/api/kanban-columns", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, label }),
        });
        if (!res.ok) {
          setError(await readApiError(res, "kanban_column_create_failed"));
          return;
        }
        await reloadColumns();
      } catch {
        setError("Falha de rede ao criar coluna.");
      }
    },
    [kind, reloadColumns],
  );

  const removeColumn = useCallback(
    async (id: string, moveCardsToColumnId?: string): Promise<DeleteColumnResult> => {
      try {
        const res = await fetch(`/api/kanban-columns/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moveCardsToColumnId }),
        });
        if (!res.ok) {
          const json = (await res.json().catch(() => null)) as { code?: string } | null;
          return {
            ok: false,
            code: json?.code,
            error: await readApiError(res, "kanban_column_delete_failed"),
          };
        }
        await reloadColumns();
        return { ok: true };
      } catch {
        return { ok: false, error: "Falha de rede ao excluir coluna." };
      }
    },
    [reloadColumns],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      const previous = columns;
      setColumns((prev) => {
        const byId = new Map(prev.map((c) => [c.id, c]));
        return orderedIds
          .map((id, index) => {
            const column = byId.get(id);
            return column ? { ...column, position: index } : null;
          })
          .filter((c): c is KanbanColumnRow => c !== null);
      });
      try {
        const res = await fetch("/api/kanban-columns/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, orderedIds }),
        });
        if (!res.ok) {
          setColumns(previous);
          setError(await readApiError(res, "kanban_columns_reorder_failed"));
        }
      } catch {
        setColumns(previous);
        setError("Falha de rede ao reordenar colunas.");
      }
    },
    [columns, kind],
  );

  const setBackground = useCallback(
    async (value: string) => {
      const previous = background;
      setBackgroundState(value);
      try {
        const res = await fetch("/api/kanban-board-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, background: value }),
        });
        if (!res.ok) {
          setBackgroundState(previous);
          setError(await readApiError(res, "kanban_board_settings_update_failed"));
        }
      } catch {
        setBackgroundState(previous);
        setError("Falha de rede ao mudar a cor do fundo.");
      }
    },
    [background, kind],
  );

  const setFullscreen = useCallback(
    async (value: boolean) => {
      const previous = isFullscreen;
      setIsFullscreenState(value);
      try {
        const res = await fetch("/api/kanban-board-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, isFullscreen: value }),
        });
        if (!res.ok) {
          setIsFullscreenState(previous);
          setError(await readApiError(res, "kanban_board_settings_update_failed"));
        }
      } catch {
        setIsFullscreenState(previous);
        setError("Falha de rede ao mudar o modo de visualização.");
      }
    },
    [isFullscreen, kind],
  );

  const setAppearance = useCallback(
    async (value: KanbanAppearance) => {
      const previous = appearance;
      setAppearanceState(value);
      try {
        const res = await fetch("/api/kanban-board-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, appearance: value }),
        });
        if (!res.ok) {
          setAppearanceState(previous);
          setError(await readApiError(res, "kanban_board_settings_update_failed"));
        }
      } catch {
        setAppearanceState(previous);
        setError("Falha de rede ao mudar a aparência das colunas.");
      }
    },
    [appearance, kind],
  );

  const setTheme = useCallback(
    (theme: KanbanColumnTheme) => {
      void setAppearance(withKanbanTheme(appearance, theme));
    },
    [appearance, setAppearance],
  );

  const setSolidColor = useCallback(
    (solidColor: string) => {
      void setAppearance(withKanbanSolidColor(appearance, solidColor));
    },
    [appearance, setAppearance],
  );

  const setColumnColor = useCallback(
    (columnId: string, colorId: string) => {
      void setAppearance(withKanbanColumnColor(appearance, columnId, colorId));
    },
    [appearance, setAppearance],
  );

  const setColorMode = useCallback(
    (colorMode: KanbanColumnColorMode) => {
      void setAppearance(withKanbanColorMode(appearance, colorMode));
    },
    [appearance, setAppearance],
  );

  useEffect(() => {
    const key = kanbanAppearanceStorageKey(kind);
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore quota / private mode
    }
    if (!isDefaultKanbanAppearance(initial.appearance)) return;
    try {
      const fromStorage = parseKanbanAppearance(JSON.parse(raw) as unknown);
      if (isDefaultKanbanAppearance(fromStorage)) return;
      void setAppearance(fromStorage);
    } catch {
      // JSON inválido — a chave já foi apagada.
    }
    // Só na montagem: migra o protótipo localStorage uma vez.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-shot localStorage → DB
  }, [kind]);

  return {
    columns,
    background,
    isFullscreen,
    appearance,
    error,
    rename,
    addColumn,
    removeColumn,
    reorder,
    toggleCollapse,
    setBackground,
    setFullscreen,
    setAppearance,
    setTheme,
    setSolidColor,
    setColumnColor,
    setColorMode,
  };
}
