"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationCycleKind } from "@/generated/prisma/client";
import type { MovedCycleRow } from "@/lib/compras/replenishment-cycle-data";
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
  | { ok: true; relocated: MovedCycleRow[] }
  | { ok: false; code?: string; error: string };

export type KanbanBoardInitialData = {
  columns: KanbanColumnRow[];
  background: string;
  isFullscreen: boolean;
  appearance: KanbanAppearance;
};

type BoardSettings = Pick<KanbanBoardInitialData, "background" | "isFullscreen" | "appearance">;

const SETTINGS_NETWORK_ERRORS: Record<keyof BoardSettings, string> = {
  background: "Falha de rede ao mudar a cor do fundo.",
  isFullscreen: "Falha de rede ao mudar o modo de visualização.",
  appearance: "Falha de rede ao mudar a aparência das colunas.",
};

/**
 * Colunas + fundo + tela cheia + aparência das colunas do Kanban (Compras
 * ou Operações Full) — tudo compartilhado pela organização e persistido no
 * banco (igual a um board no Trello). Semeado com `initial` (já carregado
 * no servidor, ver `page.tsx` de cada board) em vez de buscar num
 * `useEffect` — sem isso a página nasce com o estado "vazio"/padrão e só
 * corrige depois de montar, um "piscar" visível especialmente incômodo pra
 * coluna colapsada (aparece expandida por um instante e depois encolhe).
 *
 * Toda ação é otimista e, se o servidor recusar, desfaz **só o que ela
 * mudou** (o campo daquela coluna, as posições daquela reordenação) — nunca
 * restaura um snapshot inteiro, que apagaria outra ação feita nesse meio
 * tempo. Os callbacks são estáveis (leem o estado atual de um ref), pra o
 * board poder memoizar colunas e cards.
 */
export function useKanbanBoard(kind: OperationCycleKind, initial: KanbanBoardInitialData) {
  const [columns, setColumns] = useState<KanbanColumnRow[]>(initial.columns);
  const [settings, setSettings] = useState<BoardSettings>({
    background: initial.background,
    isFullscreen: initial.isFullscreen,
    appearance: initial.appearance,
  });
  const [error, setError] = useState<string | null>(null);

  // Escrita num effect: mutar ref durante o render é erro nas regras do
  // React Compiler (mesmo padrão de `HomeWidgetGrid`).
  const latest = useRef({ columns, settings });
  useEffect(() => {
    latest.current = { columns, settings };
  }, [columns, settings]);

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

  const patchColumn = useCallback(
    async (
      id: string,
      patch: Partial<Pick<KanbanColumnRow, "label" | "isCollapsed">>,
      networkError: string,
    ) => {
      const before = latest.current.columns.find((c) => c.id === id);
      if (!before) return;
      const undo: Partial<KanbanColumnRow> = {};
      if (patch.label !== undefined) undo.label = before.label;
      if (patch.isCollapsed !== undefined) undo.isCollapsed = before.isCollapsed;
      const revert = () =>
        setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...undo } : c)));

      setColumns((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      setError(null);
      try {
        const res = await fetch(`/api/kanban-columns/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) {
          revert();
          setError(await readApiError(res, "kanban_column_update_failed"));
        }
      } catch {
        revert();
        setError(networkError);
      }
    },
    [],
  );

  const rename = useCallback(
    (id: string, label: string) =>
      patchColumn(id, { label }, "Falha de rede ao renomear coluna."),
    [patchColumn],
  );

  const toggleCollapse = useCallback(
    (id: string, isCollapsed: boolean) =>
      patchColumn(id, { isCollapsed }, "Falha de rede ao atualizar coluna."),
    [patchColumn],
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

  /** Com cards na coluna, `moveCardsToColumnId` é obrigatório: o servidor
   * realoca os cards (mesma regra de status do drag) e devolve as linhas
   * realocadas pra quem chamou atualizar os cards sem esperar um resync. */
  const removeColumn = useCallback(
    async (id: string, moveCardsToColumnId?: string): Promise<DeleteColumnResult> => {
      try {
        const res = await fetch(`/api/kanban-columns/${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ moveCardsToColumnId }),
        });
        if (!res.ok) {
          const json = (await res.clone().json().catch(() => null)) as { code?: string } | null;
          return {
            ok: false,
            code: json?.code,
            error: await readApiError(res, "kanban_column_delete_failed"),
          };
        }
        const json = (await res.json()) as { relocated?: MovedCycleRow[] };
        setColumns((prev) => prev.filter((c) => c.id !== id));
        await reloadColumns();
        return { ok: true, relocated: json.relocated ?? [] };
      } catch {
        return { ok: false, error: "Falha de rede ao excluir coluna." };
      }
    },
    [reloadColumns],
  );

  const reorder = useCallback(
    async (orderedIds: string[]) => {
      const previousPosition = new Map(latest.current.columns.map((c) => [c.id, c.position]));
      const nextPosition = new Map(orderedIds.map((id, index) => [id, index]));
      setColumns((prev) =>
        prev.map((c) => ({ ...c, position: nextPosition.get(c.id) ?? c.position })),
      );
      const revert = () =>
        setColumns((prev) =>
          prev.map((c) => ({ ...c, position: previousPosition.get(c.id) ?? c.position })),
        );
      setError(null);
      try {
        const res = await fetch("/api/kanban-columns/reorder", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, orderedIds }),
        });
        if (!res.ok) {
          revert();
          setError(await readApiError(res, "kanban_columns_reorder_failed"));
        }
      } catch {
        revert();
        setError("Falha de rede ao reordenar colunas.");
      }
    },
    [kind],
  );

  const patchSettings = useCallback(
    async <K extends keyof BoardSettings>(key: K, value: BoardSettings[K]) => {
      const previous = latest.current.settings[key];
      setSettings((prev) => ({ ...prev, [key]: value }));
      // Só desfaz se ninguém trocou o valor de novo nesse meio tempo.
      const revert = () =>
        setSettings((prev) => (prev[key] === value ? { ...prev, [key]: previous } : prev));
      setError(null);
      try {
        const res = await fetch("/api/kanban-board-settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind, [key]: value }),
        });
        if (!res.ok) {
          revert();
          setError(await readApiError(res, "kanban_board_settings_update_failed"));
        }
      } catch {
        revert();
        setError(SETTINGS_NETWORK_ERRORS[key]);
      }
    },
    [kind],
  );

  const setBackground = useCallback(
    (value: string) => patchSettings("background", value),
    [patchSettings],
  );

  const setFullscreen = useCallback(
    (value: boolean) => patchSettings("isFullscreen", value),
    [patchSettings],
  );

  const setAppearance = useCallback(
    (value: KanbanAppearance) => patchSettings("appearance", value),
    [patchSettings],
  );

  const setTheme = useCallback(
    (theme: KanbanColumnTheme) => {
      void setAppearance(withKanbanTheme(latest.current.settings.appearance, theme));
    },
    [setAppearance],
  );

  const setSolidColor = useCallback(
    (solidColor: string) => {
      void setAppearance(withKanbanSolidColor(latest.current.settings.appearance, solidColor));
    },
    [setAppearance],
  );

  const setColumnColor = useCallback(
    (columnId: string, colorId: string) => {
      void setAppearance(
        withKanbanColumnColor(latest.current.settings.appearance, columnId, colorId),
      );
    },
    [setAppearance],
  );

  const setColorMode = useCallback(
    (colorMode: KanbanColumnColorMode) => {
      void setAppearance(withKanbanColorMode(latest.current.settings.appearance, colorMode));
    },
    [setAppearance],
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
    background: settings.background,
    isFullscreen: settings.isFullscreen,
    appearance: settings.appearance,
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
