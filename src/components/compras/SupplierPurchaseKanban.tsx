"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { DndContext, DragOverlay, type DragEndEvent } from "@dnd-kit/core";
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
import { PURCHASE_STATUS_LABELS } from "@/lib/compras/replenishment-cycle";
import { supplierPathSegment } from "@/lib/compras/purchase-analysis";
import type { OperationsBoardCard, OperationsBoardsData } from "@/lib/compras/replenishment-cycle-data";
import { filterByItemListSearch } from "@/lib/item-list-search";
import { readApiError } from "@/lib/api/api-client-error";
import { useApiResource } from "@/hooks/use-api-resource";
import { useDndSensors } from "@/hooks/use-dnd-sensors";
import type { SupplierRow } from "@/components/fornecedores/FornecedoresClient";
import type { ReplenishmentStatus } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";

type PendingBackwardMove = MoveAction & {
  supplier: string;
  targetStatus: ReplenishmentStatus;
};

export function SupplierPurchaseKanban({
  initialCards,
}: {
  initialCards: OperationsBoardCard[];
}) {
  const [cards, setCards] = useState(initialCards);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [busySupplier, setBusySupplier] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeDragSupplier, setActiveDragSupplier] = useState<string | null>(null);
  const [pendingBackwardMove, setPendingBackwardMove] =
    useState<PendingBackwardMove | null>(null);
  const sensors = useDndSensors();
  const router = useRouter();

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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/replenishment-cycles", { method: "POST" });
      const json = (await res.json()) as OperationsBoardsData & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Falha ao sincronizar.");
        return;
      }
      setCards(json.purchase.cards);
    } catch {
      setError("Falha de rede ao sincronizar.");
    } finally {
      setLoading(false);
    }
  }, []);

  function planMove(supplier: string, targetStatus: ReplenishmentStatus): PendingBackwardMove {
    const cyclesInGroup = cards
      .filter((c) => c.kind === "purchase" && c.supplier === supplier)
      .map((c) => ({ cycleId: c.cycleId, status: c.status }));
    return {
      ...resolveMoveActionForSupplier(cyclesInGroup, targetStatus),
      supplier,
      targetStatus,
    };
  }

  async function executeMove(action: MoveAction & { supplier: string; targetStatus: ReplenishmentStatus }) {
    if (action.cycleIdsToTransition.length === 0) return;
    const previousCards = cards;
    setCards((prev) =>
      prev.map((c) =>
        action.cycleIdsToTransition.includes(c.cycleId)
          ? { ...c, status: action.targetStatus }
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
          status: action.targetStatus,
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

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragSupplier(null);
    const supplier = String(event.active.id).replace(SUPPLIER_DRAG_ID_PREFIX, "");
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;
    const targetStatus = overId.replace(COLUMN_DROP_ID_PREFIX, "") as ReplenishmentStatus;
    handleMoveDecision(planMove(supplier, targetStatus));
  }

  return (
    <DndContext
      sensors={sensors}
      autoScroll={false}
      onDragStart={(event) =>
        setActiveDragSupplier(String(event.active.id).replace(SUPPLIER_DRAG_ID_PREFIX, ""))
      }
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveDragSupplier(null)}
    >
      <div className="space-y-5">
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
          </div>
        </div>

        {error ? <UserFeedback>{error}</UserFeedback> : null}

        {supplierCards.length > 0 && filteredSupplierCards.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {itemListSearchEmptyMessage(searchQuery, "fornecedor")}
          </p>
        ) : null}

        {supplierCards.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Nenhum fornecedor precisa de compra no momento.
          </p>
        ) : (
          <SupplierPurchaseKanbanBoard
            cards={filteredSupplierCards}
            busySupplier={busySupplier}
          />
        )}
      </div>

      <DragOverlay>
        {activeDragCard ? <SupplierCardBody card={activeDragCard} className="w-[85vw] sm:w-72" /> : null}
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
                ? `Isso volta ${pendingBackwardMove.cycleIdsToTransition.length} produto(s) de "${pendingBackwardMove.supplier}" para "${PURCHASE_STATUS_LABELS[pendingBackwardMove.targetStatus]}".`
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
