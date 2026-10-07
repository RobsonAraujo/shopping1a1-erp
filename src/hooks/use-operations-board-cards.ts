"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { OperationCycleKind } from "@/generated/prisma/client";
import type { KanbanColumnRow } from "@/hooks/use-kanban-columns";
import { useSSEStream } from "@/hooks/use-sse-stream";
import { readApiError } from "@/lib/api/api-client-error";
import {
  finalStatusForKind,
  isOverdueBadgeSuppressed,
  mergeOperationsBoardCards,
  patchOperationsBoardCardsSales,
} from "@/lib/compras/replenishment-cycle";
import type {
  MovedCycleRow,
  OperationsBoardCard,
  OperationsBoardsData,
  OperationsCardSalesPatch,
} from "@/lib/compras/replenishment-cycle-data";

type ResyncStreamEvent =
  | ({ type: "card-patch"; mlItemId: string } & OperationsCardSalesPatch)
  | { type: "done"; cards: OperationsBoardCard[] }
  | { type: "error"; message: string };

function salesPatchFromEvent(
  event: Extract<ResyncStreamEvent, { type: "card-patch" }>,
): OperationsCardSalesPatch {
  return {
    purchaseIsOverdue: event.purchaseIsOverdue,
    searchIsOverdue: event.searchIsOverdue,
    purchaseStartsOn: event.purchaseStartsOn,
    searchStartsOn: event.searchStartsOn,
    purchaseStartsOnTooltip: event.purchaseStartsOnTooltip,
    searchStartsOnTooltip: event.searchStartsOnTooltip,
    salesPending: false,
  };
}

/** Coluna/status/posição de um card depois de ir pra `column` — mesma regra
 * do servidor (`writeCycleMoves`): reordenar na mesma coluna só mexe na
 * posição; mudar de coluna recalcula o status (final só na última coluna) e
 * apaga o "Urgente" quando o status novo o suprime. */
function withColumn(
  card: OperationsBoardCard,
  column: KanbanColumnRow,
  position: number,
  status: OperationsBoardCard["status"],
): OperationsBoardCard {
  const suppressed = isOverdueBadgeSuppressed(card.kind, status);
  return {
    ...card,
    columnId: column.id,
    columnLabel: column.label,
    columnPosition: column.position,
    position,
    status,
    ...(suppressed ? { purchaseIsOverdue: false, searchIsOverdue: false } : {}),
  };
}

export type CardMoveTarget = {
  column: KanbanColumnRow;
  /** `column` é a última do board (status final do kind). */
  isFinal: boolean;
  position: number;
};

/**
 * Estado dos cards de um board de operações (Compras ou Operações Full) —
 * tudo o que os dois kanbans faziam igual, num lugar só:
 *
 * - **Resync em background** ao montar: o board pinta com o que já estava no
 *   banco (fast path do server component) e este stream traz a venda real
 *   do Mercado Livre item a item. Os patches são acumulados e aplicados
 *   **uma vez por frame** — um `setState` por evento re-renderizava o board
 *   inteiro dezenas de vezes por segundo durante o carregamento.
 * - **Mover** (drag ou menu do card): otimista, com os ids "em voo"
 *   protegidos de um snapshot do servidor que partiu antes do drag
 *   (`mergeOperationsBoardCards` com `pendingIds`). No sucesso aplica as
 *   linhas que o servidor devolveu (status, snapshots, `updatedAt`, e
 *   posições renumeradas); no erro desfaz **só os cards movidos**.
 * - **Sincronizar** manual.
 */
export function useOperationsBoardCards(
  kind: OperationCycleKind,
  initialCards: OperationsBoardCard[],
  columns: KanbanColumnRow[],
) {
  const [cards, setCards] = useState(initialCards);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());

  // Escritos num effect (mutar ref no render quebra as regras do React
  // Compiler): os callbacks abaixo ficam estáveis e leem o estado atual.
  const latest = useRef({ cards, columns });
  useEffect(() => {
    latest.current = { cards, columns };
  }, [cards, columns]);

  /** Movimentos em voo: id do ciclo → quantos PATCHs ainda sem resposta. */
  const pending = useRef(new Map<string, number>());

  const queuedPatches = useRef(new Map<string, OperationsCardSalesPatch>());
  const frame = useRef<number | null>(null);

  const flushSalesPatches = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    const patches = queuedPatches.current;
    if (patches.size === 0) return;
    queuedPatches.current = new Map();
    setCards((prev) => patchOperationsBoardCardsSales(prev, patches));
  }, []);

  const mergeIncoming = useCallback(
    (incoming: OperationsBoardCard[]) => {
      // Patch de venda acumulado é mais velho que o snapshot — aplica antes.
      flushSalesPatches();
      const pendingIds = new Set(pending.current.keys());
      setCards((prev) => mergeOperationsBoardCards(prev, incoming, pendingIds));
    },
    [flushSalesPatches],
  );

  /** Linhas devolvidas pelo servidor (move ou exclusão de coluna). */
  const applyServerRows = useCallback((rows: MovedCycleRow[]) => {
    if (rows.length === 0) return;
    const byId = new Map(rows.map((row) => [row.cycleId, row]));
    const columnById = new Map(latest.current.columns.map((c) => [c.id, c]));
    setCards((prev) =>
      prev.map((card) => {
        const row = byId.get(card.cycleId);
        if (!row) return card;
        const column = columnById.get(row.columnId);
        const moved = column ? withColumn(card, column, row.position, row.status) : card;
        return {
          ...moved,
          position: row.position,
          status: row.status,
          updatedAt: row.updatedAt,
          warehouseQtyAtOrder: row.warehouseQtyAtOrder,
          mlQtyAtCollection: row.mlQtyAtCollection,
        };
      }),
    );
  }, []);

  const resyncStream = useSSEStream<ResyncStreamEvent>(
    useCallback(
      (event) => {
        if (event.type === "card-patch") {
          queuedPatches.current.set(event.mlItemId, salesPatchFromEvent(event));
          frame.current ??= requestAnimationFrame(() => {
            frame.current = null;
            flushSalesPatches();
          });
        } else if (event.type === "done") {
          mergeIncoming(event.cards);
        } else if (event.type === "error") {
          setError(event.message);
        }
      },
      [flushSalesPatches, mergeIncoming],
    ),
  );
  const startResync = resyncStream.start;

  useEffect(() => {
    const controller = new AbortController();
    void startResync("/api/replenishment-cycles/resync-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind }),
      signal: controller.signal,
    });
    return () => {
      controller.abort();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [kind, startResync]);

  const refresh = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch(`/api/replenishment-cycles?kind=${kind}`, { method: "POST" });
      if (!res.ok) {
        setError(await readApiError(res, "replenishment_sync_failed"));
        return;
      }
      const json = (await res.json()) as OperationsBoardsData;
      mergeIncoming(kind === "purchase" ? json.purchase.cards : json.full.cards);
    } catch {
      setError("Falha de rede ao sincronizar.");
    } finally {
      setSyncing(false);
    }
  }, [kind, mergeIncoming]);

  const moveCycles = useCallback(
    async (cycleIds: string[], target: CardMoveTarget): Promise<boolean> => {
      const ids = new Set(cycleIds);
      const before = new Map(
        latest.current.cards.filter((c) => ids.has(c.cycleId)).map((c) => [c.cycleId, c]),
      );
      if (before.size === 0) return false;

      const nextStatus = target.isFinal ? finalStatusForKind(kind) : "attention";
      setCards((prev) =>
        prev.map((card) => {
          if (!ids.has(card.cycleId)) return card;
          return card.columnId === target.column.id
            ? { ...card, position: target.position }
            : withColumn(card, target.column, target.position, nextStatus);
        }),
      );
      for (const id of ids) pending.current.set(id, (pending.current.get(id) ?? 0) + 1);
      setBusyIds((prev) => new Set([...prev, ...ids]));
      setError(null);

      const settle = () => {
        const released: string[] = [];
        for (const id of ids) {
          const left = (pending.current.get(id) ?? 1) - 1;
          if (left > 0) {
            pending.current.set(id, left);
          } else {
            pending.current.delete(id);
            released.push(id);
          }
        }
        setBusyIds((prev) => {
          const next = new Set(prev);
          for (const id of released) next.delete(id);
          return next;
        });
      };
      const revert = () =>
        setCards((prev) => prev.map((card) => before.get(card.cycleId) ?? card));

      try {
        const res = await fetch("/api/replenishment-cycles/move", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cycleIds: [...ids],
            columnId: target.column.id,
            position: target.position,
          }),
        });
        if (!res.ok) {
          revert();
          setError(await readApiError(res, "replenishment_move_failed"));
          return false;
        }
        const json = (await res.json()) as { rows: MovedCycleRow[] };
        applyServerRows(json.rows);
        return true;
      } catch {
        revert();
        setError("Falha de rede ao mover o card.");
        return false;
      } finally {
        settle();
      }
    },
    [kind, applyServerRows],
  );

  return {
    cards,
    busyIds,
    error,
    /** O stream caiu (rede/servidor): os campos de venda ficam borrados até
     * um "Sincronizar" manual — sem avisar, ninguém saberia por quê. */
    streamError: resyncStream.error
      ? "Não foi possível atualizar as vendas agora. Use Sincronizar para tentar de novo."
      : null,
    streaming: resyncStream.streaming,
    syncing,
    refresh,
    moveCycles,
    applyServerRows,
  };
}
