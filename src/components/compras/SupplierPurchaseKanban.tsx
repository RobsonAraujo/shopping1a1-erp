"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Maximize2, RefreshCw } from "lucide-react";
import { DndContext, DragOverlay, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  ItemListSearch,
  itemListSearchEmptyMessage,
} from "@/components/shared/ItemListSearch";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { UserFeedback } from "@/components/ui/user-feedback";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  SupplierPurchaseKanbanBoard,
  COLUMN_DRAG_ID_PREFIX,
  COLUMN_DROP_ID_PREFIX,
} from "@/components/compras/SupplierPurchaseKanbanBoard";
import {
  SUPPLIER_DRAG_ID_PREFIX,
  SupplierCardBody,
} from "@/components/compras/SupplierPurchaseKanbanCard";
import {
  buildSupplierBoardCards,
  resolveMoveActionForSupplier,
  type MoveAction,
} from "@/lib/compras/supplier-board";
import {
  finalStatusForKind,
  mergeOperationsBoardCards,
  patchOperationsBoardCardsSales,
} from "@/lib/compras/replenishment-cycle";
import { supplierPathSegment } from "@/lib/compras/purchase-analysis";
import type {
  OperationsBoardCard,
  OperationsBoardsData,
  OperationsCardSalesPatch,
} from "@/lib/compras/replenishment-cycle-data";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { readApiError } from "@/lib/api/api-client-error";
import { useApiResource } from "@/hooks/use-api-resource";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import { useSSEStream } from "@/hooks/use-sse-stream";
import { useKanbanBoard, type KanbanColumnRow } from "@/hooks/use-kanban-columns";
import { KanbanBackgroundPicker } from "@/components/kanban/KanbanBackgroundPicker";
import { KanbanFullscreenFrame } from "@/components/kanban/KanbanFullscreenFrame";
import type { SupplierRow } from "@/components/fornecedores/FornecedoresClient";
import { cn } from "@/lib/utils";

type PendingBackwardMove = MoveAction & {
  supplier: string;
  targetColumn: KanbanColumnRow;
  isFinalColumn: boolean;
};

type ResyncStreamEvent =
  | ({ type: "card-patch"; mlItemId: string } & OperationsCardSalesPatch)
  | { type: "done"; cards: OperationsBoardCard[] }
  | { type: "error"; message: string };

export function SupplierPurchaseKanban({
  initialCards,
  initialColumns,
  initialBackground,
  initialFullscreen,
}: {
  initialCards: OperationsBoardCard[];
  /** Colunas + cor de fundo + preferência de tela cheia já carregadas no
   * servidor — evita o "piscar" de buscar isso num `useEffect` depois de
   * montar (ver `useKanbanBoard`). */
  initialColumns: KanbanColumnRow[];
  initialBackground: string;
  initialFullscreen: boolean;
}) {
  const [cards, setCards] = useState(initialCards);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busySupplier, setBusySupplier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDragSupplier, setActiveDragSupplier] = useState<string | null>(null);
  const [activeDragColumnId, setActiveDragColumnId] = useState<string | null>(null);
  const [pendingBackwardMove, setPendingBackwardMove] =
    useState<PendingBackwardMove | null>(null);
  const sensors = useDndSensors();
  const router = useRouter();
  const {
    columns,
    background,
    isFullscreen,
    rename: renameColumn,
    addColumn,
    removeColumn,
    reorder: reorderColumns,
    toggleCollapse,
    setBackground,
    setFullscreen,
  } = useKanbanBoard("purchase", {
    columns: initialColumns,
    background: initialBackground,
    isFullscreen: initialFullscreen,
  });

  // Lista leve (só o cadastro de fornecedores, sem sweep do catálogo ML) —
  // acesso rápido a um fornecedor mesmo quando ele não tem nenhum produto
  // precisando de compra agora (e por isso não aparece como card no board).
  const suppliersResource = useApiResource<{ suppliers: SupplierRow[] }>(
    "/api/suppliers?active=true",
  );
  const supplierOptions = useMemo(
    () =>
      [...(suppliersResource.data?.suppliers ?? [])]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
        .map((s) => ({ value: s.name, label: s.name })),
    [suppliersResource.data],
  );

  const supplierCards = useMemo(() => buildSupplierBoardCards(cards), [cards]);

  const filteredSupplierCards = useMemo(
    () =>
      filterByItemListSearch(supplierCards, searchQuery, (card) => ({
        title: card.supplier,
      })),
    [supplierCards, searchQuery],
  );

  const activeDragCard = activeDragSupplier
    ? supplierCards.find((c) => c.supplier === activeDragSupplier)
    : undefined;
  const activeDragColumn = activeDragColumnId
    ? columns.find((c) => c.id === activeDragColumnId)
    : undefined;

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/replenishment-cycles?kind=purchase", {
        method: "POST",
      });
      const json = (await res.json()) as OperationsBoardsData & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Falha ao sincronizar.");
        return;
      }
      setCards((prev) => mergeOperationsBoardCards(prev, json.purchase.cards));
    } catch {
      setError("Falha de rede ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Resync em background: o board já pintou com o que estava no banco
  // (fast path do server component) — este stream busca a venda de
  // verdade no Mercado Livre e vai destravando os campos borrados
  // (`salesPending`) card a card, sem travar a tela. Também pode fazer
  // cards novos aparecerem/desaparecerem no evento final (`done`).
  const resyncStream = useSSEStream<ResyncStreamEvent>(
    useCallback((event) => {
      if (event.type === "card-patch") {
        const { mlItemId, ...patch } = event;
        setCards((prev) => patchOperationsBoardCardsSales(prev, mlItemId, patch));
      } else if (event.type === "done") {
        setCards((prev) => mergeOperationsBoardCards(prev, event.cards));
      } else if (event.type === "error") {
        setError(event.message);
      }
    }, []),
  );

  useEffect(() => {
    const controller = new AbortController();
    void resyncStream.start("/api/replenishment-cycles/resync-stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "purchase" }),
      signal: controller.signal,
    });
    return () => controller.abort();
    // Dispara 1x ao montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function planMove(supplier: string, targetColumn: KanbanColumnRow): PendingBackwardMove {
    const cyclesInGroup = cards
      .filter((c) => c.kind === "purchase" && c.supplier === supplier)
      .map((c) => ({ cycleId: c.cycleId, columnPosition: c.columnPosition }));
    const sorted = [...columns].sort((a, b) => a.position - b.position);
    const isFinalColumn = targetColumn.id === sorted[sorted.length - 1]?.id;
    return {
      ...resolveMoveActionForSupplier(cyclesInGroup, targetColumn.position),
      supplier,
      targetColumn,
      isFinalColumn,
    };
  }

  async function executeMove(action: PendingBackwardMove) {
    if (action.cycleIdsToTransition.length === 0) return;
    const previousCards = cards;
    setCards((prev) =>
      prev.map((c) =>
        action.cycleIdsToTransition.includes(c.cycleId)
          ? {
              ...c,
              columnId: action.targetColumn.id,
              columnLabel: action.targetColumn.label,
              columnPosition: action.targetColumn.position,
              status: action.isFinalColumn ? finalStatusForKind(c.kind) : "attention",
            }
          : c,
      ),
    );
    setBusySupplier(action.supplier);
    setError(null);
    try {
      const res = await fetch("/api/replenishment-cycles/batch", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cycleIds: action.cycleIdsToTransition,
          columnId: action.targetColumn.id,
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "replenishment_batch_failed"));
        setCards(previousCards);
      }
    } catch {
      setError("Falha de rede ao mover fornecedor.");
      setCards(previousCards);
    } finally {
      setBusySupplier(null);
    }
  }

  function handleMoveDecision(action: PendingBackwardMove) {
    if (action.direction === "noop") return;
    if (action.direction === "backward") {
      setPendingBackwardMove(action);
      return;
    }
    void executeMove(action);
  }

  function handleDragStart(id: string) {
    if (id.startsWith(SUPPLIER_DRAG_ID_PREFIX)) {
      setActiveDragSupplier(id.replace(SUPPLIER_DRAG_ID_PREFIX, ""));
    } else if (id.startsWith(COLUMN_DRAG_ID_PREFIX)) {
      setActiveDragColumnId(id.replace(COLUMN_DRAG_ID_PREFIX, ""));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragSupplier(null);
    setActiveDragColumnId(null);
    const activeId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    if (activeId.startsWith(COLUMN_DRAG_ID_PREFIX)) {
      if (!overId.startsWith(COLUMN_DRAG_ID_PREFIX)) return;
      const draggedId = activeId.replace(COLUMN_DRAG_ID_PREFIX, "");
      const targetId = overId.replace(COLUMN_DRAG_ID_PREFIX, "");
      if (draggedId === targetId) return;
      const sorted = [...columns].sort((a, b) => a.position - b.position);
      const locked = sorted.filter((c) => c.isLocked);
      const middle = sorted.filter((c) => !c.isLocked);
      const fromIndex = middle.findIndex((c) => c.id === draggedId);
      const toIndex = middle.findIndex((c) => c.id === targetId);
      if (fromIndex === -1 || toIndex === -1) return;
      const reordered = arrayMove(middle, fromIndex, toIndex);
      const first = locked.find((c) => c.position === 0);
      const last = locked.find((c) => c.position === sorted.length - 1);
      const fullOrder = [
        ...(first ? [first.id] : []),
        ...reordered.map((c) => c.id),
        ...(last ? [last.id] : []),
      ];
      void reorderColumns(fullOrder);
      return;
    }

    const supplier = activeId.replace(SUPPLIER_DRAG_ID_PREFIX, "");
    const targetColumnId = overId.replace(COLUMN_DROP_ID_PREFIX, "");
    const targetColumn = columns.find((c) => c.id === targetColumnId);
    if (!targetColumn) return;
    handleMoveDecision(planMove(supplier, targetColumn));
  }

  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      onDragStart={(event) => handleDragStart(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveDragSupplier(null);
        setActiveDragColumnId(null);
      }}
    >
      <KanbanFullscreenFrame
        active={isFullscreen}
        title="Compras"
        count={supplierCards.length}
        background={background}
        onExit={() => setFullscreen(false)}
      >
      <div className={cn("flex flex-col gap-5", isFullscreen && "h-full")}>
        <div className={cn("flex flex-col gap-5", isFullscreen && "px-3 pt-3 sm:px-4")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ItemListSearch
            value={searchQuery}
            onChange={setSearchQuery}
            filteredCount={filteredSupplierCards.length}
            totalCount={supplierCards.length}
            placeholder="Buscar fornecedor…"
            entitySingular="fornecedor"
            entityPlural="fornecedores"
          />
          <div className="flex items-center gap-2">
            {supplierOptions.length > 0 ? (
              <FormSelect
                value=""
                onValueChange={(name) => router.push(`/dashboard/compras/${supplierPathSegment(name)}`)}
                options={supplierOptions}
                placeholder="Ir para fornecedor…"
                triggerClassName="h-9 w-48"
                aria-label="Ir para a página de um fornecedor específico"
              />
            ) : null}
            <KanbanBackgroundPicker background={background} onChange={setBackground} />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={loading}
              onClick={() => void refresh()}
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
              Sincronizar
            </Button>
            {!isFullscreen ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={() => void setFullscreen(true)}
              >
                <Maximize2 className="size-4" aria-hidden />
                Tela cheia
              </Button>
            ) : null}
          </div>
        </div>

        {error ? <UserFeedback>{error}</UserFeedback> : null}

        {supplierCards.length > 0 && filteredSupplierCards.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {itemListSearchEmptyMessage(searchQuery, "fornecedor")}
          </p>
        ) : null}
        </div>

        {supplierCards.length === 0 ? (
          <p
            className={cn(
              "text-sm text-[var(--muted-foreground)]",
              isFullscreen && "px-3 sm:px-4",
            )}
          >
            Nenhum fornecedor precisa de compra no momento.
          </p>
        ) : (
          <SupplierPurchaseKanbanBoard
            cards={filteredSupplierCards}
            busySupplier={busySupplier}
            columns={columns}
            onRenameColumn={renameColumn}
            onAddColumn={addColumn}
            onDeleteColumn={removeColumn}
            onToggleCollapse={toggleCollapse}
            background={background}
            fullHeight={isFullscreen}
          />
        )}
      </div>
      </KanbanFullscreenFrame>

      <DragOverlay>
        {activeDragCard ? (
          <SupplierCardBody card={activeDragCard} className="w-[85vw] sm:w-72" />
        ) : activeDragColumn ? (
          <div className="w-56 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2.5 text-sm font-semibold shadow-md">
            {activeDragColumn.label}
          </div>
        ) : null}
      </DragOverlay>

      <AlertDialog
        open={pendingBackwardMove != null}
        onOpenChange={(next) => !next && setPendingBackwardMove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar fornecedor para uma etapa anterior?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBackwardMove
                ? `Isso volta ${pendingBackwardMove.cycleIdsToTransition.length} produto(s) de "${pendingBackwardMove.supplier}" para "${pendingBackwardMove.targetColumn.label}".`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingBackwardMove) void executeMove(pendingBackwardMove);
                setPendingBackwardMove(null);
              }}
            >
              Voltar etapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DndContext>
  );
}
