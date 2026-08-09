import type { FullShipmentSource } from "@/generated/prisma/client";

export type FullShipmentRecord = {
  id: string;
  shippedAt: string;
  totalCost: number;
  totalUnits: number;
  costPerUnit: number;
  source: FullShipmentSource;
  mlInboundId: string | null;
  productCount: number | null;
  billingYear: number | null;
  billingMonth: number | null;
  mlChargeDetailId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FullShipmentWriteInput = {
  shippedAt: Date;
  totalCost: number;
  totalUnits: number;
  notes?: string | null;
  source?: FullShipmentSource;
  mlInboundId?: string | null;
  productCount?: number | null;
  mlChargeDetailId?: string | null;
};

export class FullShipmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FullShipmentValidationError";
  }
}

export function roundCostPerUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

export function computeCostPerUnit(
  totalCost: number,
  totalUnits: number,
): number {
  if (!Number.isFinite(totalCost) || totalCost < 0) {
    throw new FullShipmentValidationError(
      "Informe um custo total válido (maior ou igual a zero).",
    );
  }
  if (!Number.isInteger(totalUnits) || totalUnits <= 0) {
    throw new FullShipmentValidationError(
      "Informe um total de unidades inteiro maior que zero.",
    );
  }
  return roundCostPerUnit(totalCost / totalUnits);
}

export function normalizeFullShipmentInput(
  input: FullShipmentWriteInput,
): {
  shippedAt: Date;
  totalCost: number;
  totalUnits: number;
  costPerUnit: number;
  notes: string | null;
  source: FullShipmentSource;
  mlInboundId: string | null;
  productCount: number | null;
  mlChargeDetailId: string | null;
  billingYear: number | null;
  billingMonth: number | null;
} {
  const totalCost = roundMoneyInput(input.totalCost);
  const totalUnits = input.totalUnits;
  const costPerUnit = computeCostPerUnit(totalCost, totalUnits);
  const notes =
    typeof input.notes === "string" && input.notes.trim().length > 0
      ? input.notes.trim()
      : null;

  return {
    shippedAt: input.shippedAt,
    totalCost,
    totalUnits,
    costPerUnit,
    notes,
    source: input.source ?? "manual",
    mlInboundId: input.mlInboundId ?? null,
    productCount: input.productCount ?? null,
    mlChargeDetailId: input.mlChargeDetailId ?? null,
    billingYear: null,
    billingMonth: null,
  };
}

export function normalizeImportedShipmentInput(input: {
  shippedAt: Date;
  totalCost: number;
  totalUnits: number;
  productCount?: number | null;
  mlInboundId: string;
  mlChargeDetailId?: string | null;
  billingYear: number;
  billingMonth: number;
  notes?: string | null;
}): {
  shippedAt: Date;
  totalCost: number;
  totalUnits: number;
  costPerUnit: number;
  productCount: number | null;
  notes: string | null;
  source: FullShipmentSource;
  mlInboundId: string;
  mlChargeDetailId: string | null;
  billingYear: number;
  billingMonth: number;
} {
  const totalCost = roundMoneyInput(input.totalCost);
  if (totalCost <= 0) {
    throw new FullShipmentValidationError(
      "A coleta importada do ML precisa ter custo maior que zero.",
    );
  }

  const totalUnits = Number.isInteger(input.totalUnits) ? input.totalUnits : 0;
  const costPerUnit =
    totalUnits > 0 ? computeCostPerUnit(totalCost, totalUnits) : 0;

  return {
    shippedAt: input.shippedAt,
    totalCost,
    totalUnits,
    costPerUnit,
    productCount:
      typeof input.productCount === "number" && input.productCount > 0
        ? input.productCount
        : null,
    notes: input.notes ?? null,
    source: "ml_billing",
    mlInboundId: input.mlInboundId,
    mlChargeDetailId: input.mlChargeDetailId ?? null,
    billingYear: input.billingYear,
    billingMonth: input.billingMonth,
  };
}

export function normalizeShipmentUpdateInput(input: {
  shippedAt?: Date;
  totalCost?: number;
  totalUnits?: number;
  notes?: string | null;
}): Partial<{
  shippedAt: Date;
  totalCost: number;
  totalUnits: number;
  costPerUnit: number;
  notes: string | null;
}> {
  const patch: Partial<{
    shippedAt: Date;
    totalCost: number;
    totalUnits: number;
    costPerUnit: number;
    notes: string | null;
  }> = {};

  if (input.shippedAt) {
    patch.shippedAt = input.shippedAt;
  }

  if (input.notes !== undefined) {
    patch.notes =
      typeof input.notes === "string" && input.notes.trim().length > 0
        ? input.notes.trim()
        : null;
  }

  if (input.totalCost !== undefined) {
    const totalCost = roundMoneyInput(input.totalCost);
    if (totalCost < 0) {
      throw new FullShipmentValidationError(
        "Informe um custo total válido (maior ou igual a zero).",
      );
    }
    patch.totalCost = totalCost;
  }

  if (input.totalUnits !== undefined) {
    if (!Number.isInteger(input.totalUnits) || input.totalUnits < 0) {
      throw new FullShipmentValidationError(
        "Informe um total de unidades inteiro maior ou igual a zero.",
      );
    }
    patch.totalUnits = input.totalUnits;
  }

  return patch;
}

export function finalizeShipmentPatch(
  current: Pick<FullShipmentRecord, "totalCost" | "totalUnits">,
  patch: Partial<{
    totalCost: number;
    totalUnits: number;
  }>,
): { totalCost: number; totalUnits: number; costPerUnit: number } {
  const totalCost = patch.totalCost ?? current.totalCost;
  const totalUnits = patch.totalUnits ?? current.totalUnits;

  if (totalUnits === 0) {
    return { totalCost, totalUnits: 0, costPerUnit: 0 };
  }

  return {
    totalCost,
    totalUnits,
    costPerUnit: computeCostPerUnit(totalCost, totalUnits),
  };
}

function roundMoneyInput(value: number): number {
  if (!Number.isFinite(value)) {
    throw new FullShipmentValidationError("Valor monetário inválido.");
  }
  return Math.round(value * 100) / 100;
}
