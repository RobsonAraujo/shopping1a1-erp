import type {
  OperationCycleKind,
  ReplenishmentStatus,
} from "@/generated/prisma/client";

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

export const PURCHASE_STATUS_LABELS: Record<
  ReplenishmentStatus,
  string
> = {
  attention: "Entrada",
  analyzing: "Analisando",
  quoted: "Aguardando orçamento",
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

export function nextStatusForKind(
  kind: OperationCycleKind,
  status: ReplenishmentStatus,
): ReplenishmentStatus | null {
  if (status === "completed") return null;
  const order =
    kind === "purchase" ? PURCHASE_STATUS_ORDER : FULL_STATUS_ORDER;
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
  if (
    cycle.completedMlQty === null ||
    cycle.completedWarehouseQty === null
  ) {
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

export type BoardSummaryCounts = {
  attention: number;
  analyzing: number;
  quoted: number;
  ordered: number;
  scheduled: number;
  collected: number;
  totalActive: number;
};

export type OperationsSummaryCounts = {
  purchase: BoardSummaryCounts;
  full: BoardSummaryCounts;
  totalActive: number;
};

function emptyBoardSummary(): BoardSummaryCounts {
  return {
    attention: 0,
    analyzing: 0,
    quoted: 0,
    ordered: 0,
    scheduled: 0,
    collected: 0,
    totalActive: 0,
  };
}

export function summarizeBoardCounts(
  kind: OperationCycleKind,
  statuses: ReplenishmentStatus[],
): BoardSummaryCounts {
  const counts = emptyBoardSummary();

  for (const status of statuses) {
    if (!isActiveReplenishmentStatus(status)) continue;
    counts.totalActive += 1;
    switch (status) {
      case "attention":
        counts.attention += 1;
        break;
      case "analyzing":
        counts.analyzing += 1;
        break;
      case "quoted":
        counts.quoted += 1;
        break;
      case "ordered":
        if (kind === "purchase") counts.ordered += 1;
        break;
      case "scheduled":
        if (kind === "full") counts.scheduled += 1;
        break;
      case "collected":
        if (kind === "full") counts.collected += 1;
        break;
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
