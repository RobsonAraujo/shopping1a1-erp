"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { itemListSearchEmptyMessage } from "@/components/shared/ItemListSearch";
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
import { SupplierCardBody } from "@/components/compras/SupplierPurchaseKanbanCard";
import { KanbanBoard } from "@/components/kanban/KanbanBoard";
import { KanbanFullscreenFrame } from "@/components/kanban/KanbanFullscreenFrame";
import { KanbanToolbar } from "@/components/kanban/KanbanToolbar";
import type { SupplierRow } from "@/components/fornecedores/FornecedoresClient";
import {
  buildSupplierBoardCards,
  resolveMoveActionForSupplier,
  reuseUnchangedSupplierCards,
  withCurrentColumnInfo,
  type MoveDirection,
  type SupplierBoardCard,
} from "@/lib/compras/supplier-board";
import { supplierPathSegment } from "@/lib/compras/purchase-analysis";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";
import { matchesItemListSearch } from "@/lib/item-list-search";
import type { KanbanAppearance } from "@/lib/kanban/kanban-column-colors";
import { useApiResource } from "@/hooks/use-api-resource";
import { useKanbanBoard, type KanbanColumnRow } from "@/hooks/use-kanban-columns";
import {
  useOperationsBoardCards,
  type CardMoveTarget,
} from "@/hooks/use-operations-board-cards";
import { cn } from "@/lib/utils";

type PlannedSupplierMove = {
  supplier: string;
  direction: MoveDirection;
  /** Ciclos que mudam de coluna (os que "voltam etapa" no caso backward). */
  transitionCount: number;
  /** Tudo o que é escrito: os que mudam de coluna **e** os que já estavam
   * nela — todos recebem a posição onde o card foi solto. */
  cycleIds: string[];
  target: CardMoveTarget;
};

const NO_SUPPLIERS: ReadonlySet<string> = new Set();

const getSupplierId = (card: SupplierBoardCard) => card.supplier;
const getSupplierColumnId = (card: SupplierBoardCard) => card.columnId;
const getSupplierPosition = (card: SupplierBoardCard) => card.position;
const renderSupplierCard = (card: SupplierBoardCard, menu: ReactNode) => (
  <SupplierCardBody card={card} menu={menu} />
);

/**
 * Kanban de Compras: um card por **fornecedor** (agregado dos ciclos de
 * reposição dos produtos dele — ver `supplier-board.ts`), porque a compra é
 * feita por fornecedor, não produto a produto.
 */
export function SupplierPurchaseKanban({
  initialCards,
  initialColumns,
  initialBackground,
  initialFullscreen,
  initialAppearance,
}: {
  initialCards: OperationsBoardCard[];
  /** Colunas + fundo + tela cheia + aparência já carregadas no servidor —
   * evita o "piscar" de buscar isso num `useEffect` depois de montar
   * (ver `useKanbanBoard`). */
  initialColumns: KanbanColumnRow[];
  initialBackground: string;
  initialFullscreen: boolean;
  initialAppearance: KanbanAppearance;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingBackwardMove, setPendingBackwardMove] = useState<PlannedSupplierMove | null>(null);
  const router = useRouter();
  const board = useKanbanBoard("purchase", {
    columns: initialColumns,
    background: initialBackground,
    isFullscreen: initialFullscreen,
    appearance: initialAppearance,
  });
  const { columns, removeColumn, setFullscreen } = board;
  const {
    cards: rawCards,
    busyIds,
    error: cardsError,
    streamError,
    streaming,
    syncing,
    refresh,
    moveCycles,
    applyServerRows,
  } = useOperationsBoardCards("purchase", initialCards, columns);

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

  const cards = useMemo(() => withCurrentColumnInfo(rawCards, columns), [rawCards, columns]);

  // Estado derivado guardado entre renders (padrão "ajustar estado quando a
  // prop muda" do React): cada fornecedor mantém o objeto anterior enquanto
  // o conteúdo não muda, então o board memoizado só re-renderiza o card que
  // de fato mudou durante o streaming de vendas.
  const [derived, setDerived] = useState(() => ({
    source: cards,
    supplierCards: buildSupplierBoardCards(cards),
  }));
  let supplierCards = derived.supplierCards;
  if (derived.source !== cards) {
    supplierCards = reuseUnchangedSupplierCards(derived.supplierCards, buildSupplierBoardCards(cards));
    setDerived({ source: cards, supplierCards });
  }

  const filterCard = useMemo(
    () =>
      searchQuery.trim()
        ? (card: SupplierBoardCard) => matchesItemListSearch(searchQuery, { title: card.supplier })
        : null,
    [searchQuery],
  );
  const filteredCount = filterCard ? supplierCards.filter(filterCard).length : supplierCards.length;

  const busySupplierIds = useMemo(() => {
    if (busyIds.size === 0) return NO_SUPPLIERS;
    return new Set(
      supplierCards.filter((s) => s.cycleIds.some((id) => busyIds.has(id))).map((s) => s.supplier),
    );
  }, [busyIds, supplierCards]);

  const planMove = useCallback(
    (supplier: string, column: KanbanColumnRow, position: number): PlannedSupplierMove | null => {
      const cycles = cards.filter((c) => c.kind === "purchase" && c.supplier === supplier);
      const action = resolveMoveActionForSupplier(
        cycles.map((c) => ({ cycleId: c.cycleId, columnPosition: c.columnPosition })),
        column.position,
      );
      const alreadyThere = cycles.filter((c) => c.columnId === column.id).map((c) => c.cycleId);
      const cycleIds = [...new Set([...action.cycleIdsToTransition, ...alreadyThere])];
      if (cycleIds.length === 0) return null;
      const last = columns.reduce<KanbanColumnRow | undefined>(
        (max, c) => (!max || c.position > max.position ? c : max),
        undefined,
      );
      return {
        supplier,
        direction: action.direction,
        transitionCount: action.cycleIdsToTransition.length,
        cycleIds,
        target: { column, isFinal: column.id === last?.id, position },
      };
    },
    [cards, columns],
  );

  const handleMoveCard = useCallback(
    (card: SupplierBoardCard, column: KanbanColumnRow, position: number) => {
      const plan = planMove(card.supplier, column, position);
      if (!plan) return;
      // Voltar etapa é ação corretiva deliberada (regride produtos já
      // adiantados) — pede confirmação. Avançar e reordenar na mesma coluna
      // ("noop" de etapa) aplicam direto.
      if (plan.direction === "backward") {
        setPendingBackwardMove(plan);
        return;
      }
      void moveCycles(plan.cycleIds, plan.target);
    },
    [planMove, moveCycles],
  );

  const handleDeleteColumn = useCallback(
    async (id: string, moveCardsToColumnId?: string) => {
      const result = await removeColumn(id, moveCardsToColumnId);
      if (result.ok) applyServerRows(result.relocated);
      return result;
    },
    [removeColumn, applyServerRows],
  );

  const exitFullscreen = useCallback(() => {
    void setFullscreen(false);
  }, [setFullscreen]);

  const isFullscreen = board.isFullscreen;
  const errors = [...new Set([cardsError, board.error, streamError].filter(Boolean))];

  return (
    <>
      <KanbanFullscreenFrame
        active={isFullscreen}
        title="Compras"
        count={supplierCards.length}
        background={board.background}
        onExit={exitFullscreen}
      >
        <div className={cn("flex min-h-0 flex-col gap-3 sm:gap-5", isFullscreen && "h-full max-sm:overflow-hidden")}>
          <div
            className={cn(
              "flex shrink-0 flex-col gap-3 sm:gap-5",
              isFullscreen && "px-3 pt-3 sm:px-4",
            )}
          >
            <KanbanToolbar
              search={{
                value: searchQuery,
                onChange: setSearchQuery,
                filteredCount,
                totalCount: supplierCards.length,
                placeholder: "Buscar fornecedor…",
                entitySingular: "fornecedor",
                entityPlural: "fornecedores",
              }}
              extra={
                supplierOptions.length > 0 ? (
                  <FormSelect
                    className="hidden sm:block"
                    value=""
                    onValueChange={(name) =>
                      router.push(`/dashboard/compras/${supplierPathSegment(name)}`)
                    }
                    options={supplierOptions}
                    placeholder="Ir para fornecedor…"
                    triggerClassName="h-9 w-48"
                    aria-label="Ir para a página de um fornecedor específico"
                  />
                ) : null
              }
              background={board.background}
              onBackgroundChange={board.setBackground}
              appearance={board.appearance}
              setTheme={board.setTheme}
              setSolidColor={board.setSolidColor}
              setColorMode={board.setColorMode}
              syncing={syncing}
              syncDisabled={syncing || streaming}
              onSync={() => void refresh()}
              isFullscreen={isFullscreen}
              onEnterFullscreen={() => void setFullscreen(true)}
            />

            {errors.map((message) => (
              <UserFeedback key={message}>{message}</UserFeedback>
            ))}

            {supplierCards.length > 0 && filteredCount === 0 ? (
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
            <KanbanBoard
              boardId="purchase"
              columns={columns}
              cards={supplierCards}
              filterCard={filterCard}
              getCardId={getSupplierId}
              getCardColumnId={getSupplierColumnId}
              getCardPosition={getSupplierPosition}
              getCardLabel={getSupplierId}
              renderCard={renderSupplierCard}
              busyCardIds={busySupplierIds}
              onMoveCard={handleMoveCard}
              onReorderColumns={board.reorder}
              onRenameColumn={board.rename}
              onAddColumn={board.addColumn}
              onDeleteColumn={handleDeleteColumn}
              onToggleCollapse={board.toggleCollapse}
              appearance={board.appearance}
              setColumnColor={board.setColumnColor}
              background={board.background}
              fullHeight={isFullscreen}
            />
          )}
        </div>
      </KanbanFullscreenFrame>

      <AlertDialog
        open={pendingBackwardMove != null}
        onOpenChange={(next) => !next && setPendingBackwardMove(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Voltar fornecedor para uma etapa anterior?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingBackwardMove
                ? `Isso volta ${pendingBackwardMove.transitionCount} produto(s) de "${pendingBackwardMove.supplier}" para "${pendingBackwardMove.target.column.label}".`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pendingBackwardMove) {
                  void moveCycles(pendingBackwardMove.cycleIds, pendingBackwardMove.target);
                }
                setPendingBackwardMove(null);
              }}
            >
              Voltar etapa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
