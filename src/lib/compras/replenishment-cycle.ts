import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";
import type {
  OperationsBoardCard,
  OperationsCardSalesPatch,
} from "@/lib/compras/replenishment-cycle-data";

export type ReplenishmentSnapshot = {
  mlQty: number;
  warehouseQty: number;
  leadTimeDays: number;
};

export type ReplenishmentCycleRecord = {
  id: string;
  mlItemId: string;
  kind: OperationCycleKind;
  status: ReplenishmentStatus;
  triggerMlQty: number;
  triggerWarehouseQty: number;
  triggerLeadTimeDays: number | null;
  warehouseQtyAtOrder: number | null;
  mlQtyAtCollection: number | null;
  completedMlQty: number | null;
  completedWarehouseQty: number | null;
  completedLeadTimeDays: number | null;
  completedAt: Date | null;
};

export const PURCHASE_BOARD_COLUMNS: ReplenishmentStatus[] = [
  "attention",
  "analyzing",
  "quoted",
  "ordered",
];

export const FULL_BOARD_COLUMNS: ReplenishmentStatus[] = [
  "attention",
  "scheduled",
  "collected",
];

const PURCHASE_STATUS_ORDER: ReplenishmentStatus[] = [
  "attention",
  "analyzing",
  "quoted",
  "ordered",
  "completed",
];

const FULL_STATUS_ORDER: ReplenishmentStatus[] = [
  "attention",
  "scheduled",
  "collected",
  "completed",
];

export const PURCHASE_STATUS_LABELS: Record<ReplenishmentStatus, string> = {
  attention: "Entrada",
  analyzing: "Analisando",
  quoted: "Em Cotação",
  ordered: "Comprado",
  scheduled: "Agendado",
  collected: "Coletado",
  completed: "Concluído",
};

export const FULL_STATUS_LABELS: Record<ReplenishmentStatus, string> = {
  attention: "Entrada",
  analyzing: "Analisando",
  quoted: "Aguardando orçamento",
  ordered: "Comprado",
  scheduled: "Agendado",
  collected: "Coletado",
  completed: "Concluído",
};

export function statusLabelsForKind(
  kind: OperationCycleKind,
): Record<ReplenishmentStatus, string> {
  return kind === "purchase" ? PURCHASE_STATUS_LABELS : FULL_STATUS_LABELS;
}

export function boardColumnsForKind(
  kind: OperationCycleKind,
): ReplenishmentStatus[] {
  return kind === "purchase" ? PURCHASE_BOARD_COLUMNS : FULL_BOARD_COLUMNS;
}

export function isActiveReplenishmentStatus(
  status: ReplenishmentStatus,
): boolean {
  return status !== "completed";
}

/** `true` quando o ciclo já passou da etapa em que "começar agora" ainda faz
 * sentido — full: já coletado; purchase: já comprado. A badge "Urgente"
 * some nesse ponto mesmo que a projeção de estoque ainda acuse atraso,
 * porque essa projeção (`stock-planning.ts`) não olha o status do ciclo. */
export function isOverdueBadgeSuppressed(
  kind: OperationCycleKind,
  status: ReplenishmentStatus,
): boolean {
  if (kind === "full") return status === "collected";
  if (kind === "purchase") return status === "ordered";
  return false;
}

/** Índice do status dentro das colunas do board de compra (`PURCHASE_BOARD_COLUMNS`),
 * ou -1 se não for uma coluna visível desse board (ex.: `completed`, `scheduled`). */
export function purchaseStatusOrderIndex(status: ReplenishmentStatus): number {
  return PURCHASE_BOARD_COLUMNS.indexOf(status);
}

export function nextStatusForKind(
  kind: OperationCycleKind,
  status: ReplenishmentStatus,
): ReplenishmentStatus | null {
  if (status === "completed") return null;
  const order = kind === "purchase" ? PURCHASE_STATUS_ORDER : FULL_STATUS_ORDER;
  const index = order.indexOf(status);
  if (index < 0 || index >= order.length - 1) return null;
  return order[index + 1] ?? null;
}

export function replenishmentSnapshotFromCycle(
  cycle: Pick<
    ReplenishmentCycleRecord,
    "completedMlQty" | "completedWarehouseQty" | "completedLeadTimeDays"
  >,
): ReplenishmentSnapshot | null {
  if (cycle.completedMlQty === null || cycle.completedWarehouseQty === null) {
    return null;
  }
  return {
    mlQty: cycle.completedMlQty,
    warehouseQty: cycle.completedWarehouseQty,
    leadTimeDays: cycle.completedLeadTimeDays ?? 0,
  };
}

export function snapshotsMatch(
  a: ReplenishmentSnapshot,
  b: ReplenishmentSnapshot,
): boolean {
  return (
    a.mlQty === b.mlQty &&
    a.warehouseQty === b.warehouseQty &&
    a.leadTimeDays === b.leadTimeDays
  );
}

export function isCompletedCycleStillValid(
  cycle: ReplenishmentCycleRecord,
  current: ReplenishmentSnapshot,
): boolean {
  if (cycle.status !== "completed") return false;
  const completed = replenishmentSnapshotFromCycle(cycle);
  if (!completed) return false;
  return snapshotsMatch(completed, current);
}

export function shouldAutoCompletePurchaseCycle(
  cycle: ReplenishmentCycleRecord,
  current: ReplenishmentSnapshot,
  needsPurchaseAttention: boolean,
): boolean {
  if (cycle.kind !== "purchase" || cycle.status === "completed") {
    return false;
  }
  if (!needsPurchaseAttention) {
    return true;
  }
  if (cycle.status !== "ordered") return false;
  if (cycle.warehouseQtyAtOrder === null) return false;
  return current.warehouseQty > cycle.warehouseQtyAtOrder;
}

export function shouldAutoCompleteFullCycle(
  cycle: ReplenishmentCycleRecord,
  current: ReplenishmentSnapshot,
  needsSchedulingAttention: boolean,
): boolean {
  if (cycle.kind !== "full" || cycle.status === "completed") {
    return false;
  }
  if (!needsSchedulingAttention) {
    return true;
  }
  if (cycle.status !== "collected") return false;
  if (cycle.mlQtyAtCollection === null) return false;
  return current.mlQty > cycle.mlQtyAtCollection;
}

export type CreatePurchaseCycleInput = {
  needsPurchaseAttention: boolean;
  snapshot: ReplenishmentSnapshot;
  purchaseStartsAtMs: number | null;
  suggestedQty?: number | null;
};

export type CreateFullCycleInput = {
  needsSchedulingAttention: boolean;
  snapshot: ReplenishmentSnapshot;
};

export function shouldCreatePurchaseCycle(
  input: CreatePurchaseCycleInput,
  latestCompleted: ReplenishmentCycleRecord | null,
): boolean {
  if (!input.needsPurchaseAttention) return false;
  if (
    latestCompleted &&
    isCompletedCycleStillValid(latestCompleted, input.snapshot)
  ) {
    return false;
  }
  return true;
}

export function shouldCreateFullCycle(
  input: CreateFullCycleInput,
  latestCompleted: ReplenishmentCycleRecord | null,
): boolean {
  if (!input.needsSchedulingAttention) return false;
  if (
    latestCompleted &&
    isCompletedCycleStillValid(latestCompleted, input.snapshot)
  ) {
    return false;
  }
  return true;
}

export type StatusTransitionPatch = {
  status: ReplenishmentStatus;
  warehouseQtyAtOrder?: number | null;
  mlQtyAtCollection?: number | null;
  completedMlQty?: number | null;
  completedWarehouseQty?: number | null;
  completedLeadTimeDays?: number | null;
  completedAt?: Date | null;
};

export function buildStatusTransition(
  cycle: ReplenishmentCycleRecord,
  nextStatus: ReplenishmentStatus,
  current: ReplenishmentSnapshot,
): StatusTransitionPatch {
  const patch: StatusTransitionPatch = { status: nextStatus };

  if (
    cycle.kind === "purchase" &&
    nextStatus === "ordered" &&
    cycle.warehouseQtyAtOrder === null
  ) {
    patch.warehouseQtyAtOrder = current.warehouseQty;
  }

  if (
    cycle.kind === "full" &&
    nextStatus === "collected" &&
    cycle.mlQtyAtCollection === null
  ) {
    patch.mlQtyAtCollection = current.mlQty;
  }

  if (nextStatus === "completed") {
    patch.completedMlQty = current.mlQty;
    patch.completedWarehouseQty = current.warehouseQty;
    patch.completedLeadTimeDays = current.leadTimeDays;
    patch.completedAt = new Date();
  }

  return patch;
}

export function isValidStatusForKind(
  kind: OperationCycleKind,
  status: ReplenishmentStatus,
): boolean {
  if (status === "completed") return true;
  return boardColumnsForKind(kind).includes(status);
}

/** Status que marca a coluna final travada de cada kind — só esses 2 valores
 * (mais `"attention"` e `"completed"`) são realmente atribuídos a um ciclo
 * ativo desde que as colunas viraram livres por organização (ver comentário
 * no schema, model `ReplenishmentCycle.status`). */
export function finalStatusForKind(kind: OperationCycleKind): ReplenishmentStatus {
  return kind === "purchase" ? "ordered" : "collected";
}

export type BoardSummaryCounts = {
  /** Ainda não chegou na coluna final travada — em qualquer outra coluna do
   * board (primeira ou alguma do meio, custom ou não). */
  inProgress: number;
  /** Já está na coluna final travada do kind ("Comprado"/"Coletado"). */
  final: number;
  totalActive: number;
};

export type OperationsSummaryCounts = {
  purchase: BoardSummaryCounts;
  full: BoardSummaryCounts;
  totalActive: number;
};

function emptyBoardSummary(): BoardSummaryCounts {
  return { inProgress: 0, final: 0, totalActive: 0 };
}

export function summarizeBoardCounts(
  kind: OperationCycleKind,
  statuses: ReplenishmentStatus[],
): BoardSummaryCounts {
  const counts = emptyBoardSummary();
  const final = finalStatusForKind(kind);

  for (const status of statuses) {
    if (!isActiveReplenishmentStatus(status)) continue;
    counts.totalActive += 1;
    if (status === final) {
      counts.final += 1;
    } else {
      counts.inProgress += 1;
    }
  }

  return counts;
}

export function summarizeOperationsCounts(
  entries: Array<{ kind: OperationCycleKind; status: ReplenishmentStatus }>,
): OperationsSummaryCounts {
  const purchaseStatuses = entries
    .filter((e) => e.kind === "purchase")
    .map((e) => e.status);
  const fullStatuses = entries
    .filter((e) => e.kind === "full")
    .map((e) => e.status);

  const purchase = summarizeBoardCounts("purchase", purchaseStatuses);
  const full = summarizeBoardCounts("full", fullStatuses);

  return {
    purchase,
    full,
    totalActive: purchase.totalActive + full.totalActive,
  };
}

/**
 * Mescla uma resposta "board inteiro" do servidor (drag-PATCH, botão
 * "Sincronizar" ou o evento `done` do streaming de resync) com o estado
 * local — sem isso, qualquer uma dessas respostas faz um replace bruto e
 * pode reverter uma edição local mais recente que ainda não chegou no
 * snapshot do servidor (ex.: um drag que acabou de confirmar, mas o resync
 * em streaming começou antes dele e só termina depois). `incoming` é a
 * fonte da verdade — inclusive pra remover um card que sumiu de lá (só
 * acontece por auto-complete real: o sync automático nunca marca
 * `completed` num card que o usuário moveu manualmente). Um card local só
 * "vence" o recebido se seu `updatedAt` for estritamente mais novo.
 */
export function mergeOperationsBoardCards(
  current: OperationsBoardCard[],
  incoming: OperationsBoardCard[],
): OperationsBoardCard[] {
  const currentById = new Map(current.map((card) => [card.cycleId, card]));
  return incoming.map((card) => {
    const local = currentById.get(card.cycleId);
    if (
      local &&
      new Date(local.updatedAt).getTime() > new Date(card.updatedAt).getTime()
    ) {
      return local;
    }
    return card;
  });
}

/** Aplica um patch de campos derivados de venda num card por `mlItemId` —
 * nunca toca `status`/`updatedAt`, então não compete com
 * `mergeOperationsBoardCards`. Sem efeito se nenhum card local tiver esse
 * `mlItemId` (pode já ter sido removido, ou pertencer ao outro board). */
export function patchOperationsBoardCardsSales(
  cards: OperationsBoardCard[],
  mlItemId: string,
  patch: OperationsCardSalesPatch,
): OperationsBoardCard[] {
  return cards.map((card) =>
    card.mlItemId === mlItemId ? { ...card, ...patch } : card,
  );
}
