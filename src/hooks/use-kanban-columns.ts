"use client";

import { useCallback, useEffect, useState } from "react";
import type { OperationCycleKind } from "@/generated/prisma/client";
import { readApiError } from "@/lib/api/api-client-error";

export type KanbanColumnRow = {
  id: string;
  kind: OperationCycleKind;
  label: string;
  position: number;
  isLocked: boolean;
};

export type DeleteColumnResult =
  | { ok: true }
  | { ok: false; code?: string; error: string };

/** Colunas do Kanban (Compras ou Operações Full) pra uma organização — CRUD
 * completo (renomear, criar, excluir, reordenar), compartilhado pelos dois
 * boards. `columns` já vem materializado (com os defaults de hoje) mesmo
 * pra organizações que nunca customizaram nada. */
export function useKanbanColumns(kind: OperationCycleKind) {
  const [columns, setColumns] = useState<KanbanColumnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/kanban-columns?kind=${kind}`);
      if (!res.ok) {
        setError(await readApiError(res, "kanban_columns_load_failed"));
        return;
      }
      const json = (await res.json()) as { columns: KanbanColumnRow[] };
      setColumns(json.columns);
    } catch {
      setError("Falha de rede ao carregar colunas.");
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

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
        await load();
      } catch {
        setError("Falha de rede ao criar coluna.");
      }
    },
    [kind, load],
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
        await load();
        return { ok: true };
      } catch {
        return { ok: false, error: "Falha de rede ao excluir coluna." };
      }
    },
    [load],
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

  return { columns, loading, error, reload: load, rename, addColumn, removeColumn, reorder };
}
