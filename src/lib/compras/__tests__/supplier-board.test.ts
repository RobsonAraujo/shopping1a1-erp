import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSupplierBoardCards,
  resolveMoveActionForSupplier,
  reuseUnchangedSupplierCards,
} from "../supplier-board";
import type { OperationsBoardCard } from "../replenishment-cycle-data";

const COLUMN_LABELS: Record<number, string> = {
  0: "Entrada",
  1: "Analisando",
  2: "Em Cotação",
  3: "Comprado",
};

function boardCard(
  overrides: Partial<OperationsBoardCard> & { columnPosition?: number } = {},
): OperationsBoardCard {
  const columnPosition = overrides.columnPosition ?? 0;
  return {
    cycleId: "cycle-1",
    mlItemId: "MLB1",
    kind: "purchase",
    status: "attention",
    columnId: `col-${columnPosition}`,
    columnLabel: COLUMN_LABELS[columnPosition] ?? `Coluna ${columnPosition}`,
    columnPosition,
    position: 0,
    title: "Item",
    sku: "SKU-1",
    supplier: "MXT",
    imageUrl: null,
    mlStock: 0,
    warehouseStock: 0,
    suggestedQty: null,
    purchaseIsOverdue: false,
    searchIsOverdue: false,
    purchaseStartsOn: null,
    searchStartsOn: null,
    purchaseStartsOnTooltip: "",
    searchStartsOnTooltip: "",
    needsSchedulingAttention: false,
    notes: null,
    warehouseQtyAtOrder: null,
    mlQtyAtCollection: null,
    updatedAt: "2024-01-01T00:00:00.000Z",
    salesPending: false,
    ...overrides,
  };
}

describe("buildSupplierBoardCards", () => {
  it("groups cards by supplier and sums totalActive", () => {
    const cards = [
      boardCard({ cycleId: "c1", supplier: "MXT" }),
      boardCard({ cycleId: "c2", supplier: "MXT" }),
      boardCard({ cycleId: "c3", supplier: "Aquario" }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.equal(result.length, 2);
    const mxt = result.find((r) => r.supplier === "MXT");
    assert.equal(mxt?.totalActive, 2);
    assert.deepEqual(mxt?.cycleIds.sort(), ["c1", "c2"]);
  });

  it("ignores non-purchase (full) cards", () => {
    const cards = [
      boardCard({ cycleId: "c1", kind: "purchase", supplier: "MXT" }),
      boardCard({ cycleId: "c2", kind: "full", supplier: "MXT" }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.equal(result.length, 1);
    assert.equal(result[0].totalActive, 1);
  });

  it("uses the weakest-link column (least advanced) as the card's column", () => {
    const cards = [
      boardCard({ cycleId: "c1", columnPosition: 3 }),
      boardCard({ cycleId: "c2", columnPosition: 0 }),
      boardCard({ cycleId: "c3", columnPosition: 2 }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.equal(result[0].columnPosition, 0);
  });

  it("leaves breakdown empty when every cycle shares the same column", () => {
    const cards = [
      boardCard({ cycleId: "c1", columnPosition: 1 }),
      boardCard({ cycleId: "c2", columnPosition: 1 }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.deepEqual(result[0].breakdown, []);
  });

  it("fills breakdown (ordered by column position) when columns are mixed", () => {
    const cards = [
      boardCard({ cycleId: "c1", columnPosition: 2 }),
      boardCard({ cycleId: "c2", columnPosition: 0 }),
      boardCard({ cycleId: "c3", columnPosition: 0 }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.deepEqual(result[0].breakdown, [
      { columnId: "col-0", columnLabel: "Entrada", count: 2 },
      { columnId: "col-2", columnLabel: "Em Cotação", count: 1 },
    ]);
  });

  it("flags hasOverdue when any cycle is overdue", () => {
    const cards = [
      boardCard({ cycleId: "c1", purchaseIsOverdue: false }),
      boardCard({ cycleId: "c2", purchaseIsOverdue: true }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.equal(result[0].hasOverdue, true);
  });

  it("sums suggestedQty across the group, ignoring nulls", () => {
    const cards = [
      boardCard({ cycleId: "c1", suggestedQty: 5 }),
      boardCard({ cycleId: "c2", suggestedQty: null }),
      boardCard({ cycleId: "c3", suggestedQty: 3 }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.equal(result[0].suggestedQtyTotal, 8);
  });

  it("orders top items by overdue first, then suggestedQty desc, then sku, and caps overflow", () => {
    const cards = [
      boardCard({ cycleId: "c1", sku: "Z", suggestedQty: 1, purchaseIsOverdue: false }),
      boardCard({ cycleId: "c2", sku: "A", suggestedQty: 10, purchaseIsOverdue: true }),
      boardCard({ cycleId: "c3", sku: "B", suggestedQty: 5, purchaseIsOverdue: false }),
      boardCard({ cycleId: "c4", sku: "C", suggestedQty: 2, purchaseIsOverdue: false }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.deepEqual(
      result[0].topItems.map((i) => i.sku),
      ["A", "B", "C"],
    );
    assert.equal(result[0].overflowCount, 1);
  });

  it("does not reorder suppliers by urgency — order is manual (position), kept by the board", () => {
    const cards = [
      boardCard({ cycleId: "c1", supplier: "Zulu", purchaseIsOverdue: false }),
      boardCard({ cycleId: "c2", supplier: "Aquario", purchaseIsOverdue: true }),
      boardCard({ cycleId: "c3", supplier: "Bravo", purchaseIsOverdue: false }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.deepEqual(
      result.map((r) => r.supplier),
      ["Zulu", "Aquario", "Bravo"],
    );
  });

  it("uses the smallest position among the supplier's cycles in the card's (weakest) column", () => {
    const cards = [
      boardCard({ cycleId: "c1", supplier: "MXT", columnPosition: 0, position: 2048 }),
      boardCard({ cycleId: "c2", supplier: "MXT", columnPosition: 0, position: 1024 }),
      // Ciclo mais adiantado (outra coluna) não conta pra posição do card.
      boardCard({ cycleId: "c3", supplier: "MXT", columnPosition: 2, position: -9999 }),
    ];
    const [mxt] = buildSupplierBoardCards(cards);
    assert.equal(mxt.columnId, "col-0");
    assert.equal(mxt.position, 1024);
  });
});

describe("reuseUnchangedSupplierCards", () => {
  it("keeps the previous object for suppliers whose content did not change", () => {
    const first = buildSupplierBoardCards([
      boardCard({ cycleId: "c1", supplier: "MXT" }),
      boardCard({ cycleId: "c2", supplier: "Aquario" }),
    ]);
    const rebuilt = buildSupplierBoardCards([
      boardCard({ cycleId: "c1", supplier: "MXT" }),
      boardCard({ cycleId: "c2", supplier: "Aquario", purchaseIsOverdue: true }),
    ]);
    const result = reuseUnchangedSupplierCards(first, rebuilt);
    assert.equal(result.find((c) => c.supplier === "MXT"), first.find((c) => c.supplier === "MXT"));
    assert.notEqual(
      result.find((c) => c.supplier === "Aquario"),
      first.find((c) => c.supplier === "Aquario"),
    );
    assert.equal(result.find((c) => c.supplier === "Aquario")?.hasOverdue, true);
  });
});

describe("resolveMoveActionForSupplier", () => {
  it("advances only the cycles behind the target, leaving ones ahead untouched (forward)", () => {
    const result = resolveMoveActionForSupplier(
      [
        { cycleId: "c1", columnPosition: 0 },
        { cycleId: "c2", columnPosition: 3 },
      ],
      2,
    );
    assert.equal(result.direction, "forward");
    assert.deepEqual(result.cycleIdsToTransition, ["c1"]);
  });

  it("advances every cycle when all are behind the target", () => {
    const result = resolveMoveActionForSupplier(
      [
        { cycleId: "c1", columnPosition: 0 },
        { cycleId: "c2", columnPosition: 1 },
      ],
      3,
    );
    assert.equal(result.direction, "forward");
    assert.deepEqual(result.cycleIdsToTransition.sort(), ["c1", "c2"]);
  });

  it("regresses every cycle not already at the target when none are behind it (backward)", () => {
    const result = resolveMoveActionForSupplier(
      [
        { cycleId: "c1", columnPosition: 3 },
        { cycleId: "c2", columnPosition: 2 },
      ],
      0,
    );
    assert.equal(result.direction, "backward");
    assert.deepEqual(result.cycleIdsToTransition.sort(), ["c1", "c2"]);
  });

  it("is a noop when every cycle is already exactly at the target", () => {
    const result = resolveMoveActionForSupplier(
      [
        { cycleId: "c1", columnPosition: 2 },
        { cycleId: "c2", columnPosition: 2 },
      ],
      2,
    );
    assert.equal(result.direction, "noop");
    assert.deepEqual(result.cycleIdsToTransition, []);
  });
});
