import type { ReplenishmentStatus } from "@/generated/prisma/client";

export type ReplenishmentSnapshot = {
  mlQty: number;
  warehouseQty: number;
  leadTimeDays: number;
};

export type ReplenishmentCycleRecord = {
  id: string;
  mlItemId: string;
  status: ReplenishmentStatus;
  triggerMlQty: number;
  triggerWarehouseQty: number;
  triggerLeadTimeDays: number | null;
  warehouseQtyAtOrder: number | null;
  completedMlQty: number | null;
  completedWarehouseQty: number | null;
  completedLeadTimeDays: number | null;
  completedAt: Date | null;
};

export const ACTIVE_REPLENISHMENT_STATUSES: ReplenishmentStatus[] = [
  "attention",
  "analyzing",
  "quoted",
  "ordered",
  "in_warehouse",
  "full_pending",
];

export const BOARD_COLUMN_STATUSES: ReplenishmentStatus[] = [
  ...ACTIVE_REPLENISHMENT_STATUSES,
];

export const REPLENISHMENT_STATUS_LABELS: Record<ReplenishmentStatus, string> =
  {
    attention: "Atenção",
    analyzing: "Analisando",
    quoted: "Orçamento",
    ordered: "Comprado",
    in_warehouse: "No galpão",
    full_pending: "Enviar Full",
    completed: "Concluído",
  };

const STATUS_ORDER: ReplenishmentStatus[] = [
  "attention",
  "analyzing",
  "quoted",
  "ordered",
  "in_warehouse",
  "full_pending",
  "completed",
];

export function isActiveReplenishmentStatus(
  status: ReplenishmentStatus,
): boolean {
  return status !== "completed";
}

export function nextReplenishmentStatus(
  status: ReplenishmentStatus,
  options?: { skipFull?: boolean },
): ReplenishmentStatus | null {
  if (status === "completed") return null;
  if (status === "in_warehouse") {
    return options?.skipFull ? "completed" : "full_pending";
  }
  const index = STATUS_ORDER.indexOf(status);
  if (index < 0 || index >= STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[index + 1] ?? null;
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

export function shouldAutoAdvanceToWarehouse(
  cycle: ReplenishmentCycleRecord,
  currentWarehouseQty: number,
): boolean {
  if (cycle.status !== "ordered") return false;
  if (cycle.warehouseQtyAtOrder === null) return false;
  return currentWarehouseQty > cycle.warehouseQtyAtOrder;
}

export type CreateCycleInput = {
  needsPurchaseAttention: boolean;
  needsSchedulingAttention: boolean;
  snapshot: ReplenishmentSnapshot;
  purchaseStartsAtMs: number | null;
  suggestedQty?: number | null;
};

export function initialStatusForNewCycle(
  input: Pick<CreateCycleInput, "needsPurchaseAttention" | "needsSchedulingAttention">,
): ReplenishmentStatus | null {
  if (input.needsPurchaseAttention) return "attention";
  if (input.needsSchedulingAttention) return "full_pending";
  return null;
}

export function shouldCreateReplenishmentCycle(
  input: CreateCycleInput,
  latestCompleted: ReplenishmentCycleRecord | null,
): boolean {
  const initial = initialStatusForNewCycle(input);
  if (!initial) return false;
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

  if (nextStatus === "ordered" && cycle.warehouseQtyAtOrder === null) {
    patch.warehouseQtyAtOrder = current.warehouseQty;
  }

  if (nextStatus === "completed") {
    patch.completedMlQty = current.mlQty;
    patch.completedWarehouseQty = current.warehouseQty;
    patch.completedLeadTimeDays = current.leadTimeDays;
    patch.completedAt = new Date();
  }

  return patch;
}

export type OperationsSummaryCounts = {
  attention: number;
  analyzing: number;
  quoted: number;
  ordered: number;
  inWarehouse: number;
  fullPending: number;
  totalActive: number;
};

export function summarizeOperationsCounts(
  statuses: ReplenishmentStatus[],
): OperationsSummaryCounts {
  const counts: OperationsSummaryCounts = {
    attention: 0,
    analyzing: 0,
    quoted: 0,
    ordered: 0,
    inWarehouse: 0,
    fullPending: 0,
    totalActive: 0,
  };

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
        counts.ordered += 1;
        break;
      case "in_warehouse":
        counts.inWarehouse += 1;
        break;
      case "full_pending":
        counts.fullPending += 1;
        break;
    }
  }

  return counts;
}
