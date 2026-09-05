import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildSupplierBoardCards,
  nextPurchaseBoardColumn,
  resolveMoveActionForSupplier,
} from "../supplier-board";
import type { OperationsBoardCard } from "../replenishment-cycle-data";

function boardCard(overrides: Partial<OperationsBoardCard> = {}): OperationsBoardCard {
  return {
    cycleId: "cycle-1",
    mlItemId: "MLB1",
    kind: "purchase",
    status: "attention",
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

  it("uses the weakest-link status (least advanced) as the card's column", () => {
    const cards = [
      boardCard({ cycleId: "c1", status: "ordered" }),
      boardCard({ cycleId: "c2", status: "attention" }),
      boardCard({ cycleId: "c3", status: "quoted" }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.equal(result[0].status, "attention");
  });

  it("leaves breakdown empty when every cycle shares the same status", () => {
    const cards = [
      boardCard({ cycleId: "c1", status: "analyzing" }),
      boardCard({ cycleId: "c2", status: "analyzing" }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.deepEqual(result[0].breakdown, []);
  });

  it("fills breakdown (ordered by column) when statuses are mixed", () => {
    const cards = [
      boardCard({ cycleId: "c1", status: "quoted" }),
      boardCard({ cycleId: "c2", status: "attention" }),
      boardCard({ cycleId: "c3", status: "attention" }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.deepEqual(result[0].breakdown, [
      { status: "attention", count: 2 },
      { status: "quoted", count: 1 },
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

  it("sorts suppliers: overdue first, then more active items, then name", () => {
    const cards = [
      boardCard({ cycleId: "c1", supplier: "Zulu", purchaseIsOverdue: false }),
      boardCard({ cycleId: "c2", supplier: "Aquario", purchaseIsOverdue: true }),
      boardCard({ cycleId: "c3", supplier: "Bravo", purchaseIsOverdue: false }),
      boardCard({ cycleId: "c4", supplier: "Bravo", purchaseIsOverdue: false }),
    ];
    const result = buildSupplierBoardCards(cards);
    assert.deepEqual(
      result.map((r) => r.supplier),
      ["Aquario", "Bravo", "Zulu"],
    );
  });
});

describe("resolveMoveActionForSupplier", () => {
  it("advances only the cycles behind the target, leaving ones ahead untouched (forward)", () => {
    const result = resolveMoveActionForSupplier(
      [
        { cycleId: "c1", status: "attention" },
        { cycleId: "c2", status: "ordered" },
      ],
      "quoted",
    );
    assert.equal(result.direction, "forward");
    assert.deepEqual(result.cycleIdsToTransition, ["c1"]);
  });

  it("advances every cycle when all are behind the target", () => {
    const result = resolveMoveActionForSupplier(
      [
        { cycleId: "c1", status: "attention" },
        { cycleId: "c2", status: "analyzing" },
      ],
      "ordered",
    );
    assert.equal(result.direction, "forward");
    assert.deepEqual(result.cycleIdsToTransition.sort(), ["c1", "c2"]);
  });

  it("regresses every cycle not already at the target when none are behind it (backward)", () => {
    const result = resolveMoveActionForSupplier(
      [
        { cycleId: "c1", status: "ordered" },
        { cycleId: "c2", status: "quoted" },
      ],
      "attention",
    );
    assert.equal(result.direction, "backward");
    assert.deepEqual(result.cycleIdsToTransition.sort(), ["c1", "c2"]);
  });

  it("is a noop when every cycle is already exactly at the target", () => {
    const result = resolveMoveActionForSupplier(
      [
        { cycleId: "c1", status: "quoted" },
        { cycleId: "c2", status: "quoted" },
      ],
      "quoted",
    );
    assert.equal(result.direction, "noop");
    assert.deepEqual(result.cycleIdsToTransition, []);
  });
});

describe("nextPurchaseBoardColumn", () => {
  it("returns the next column in the purchase board", () => {
    assert.equal(nextPurchaseBoardColumn("attention"), "analyzing");
    assert.equal(nextPurchaseBoardColumn("analyzing"), "quoted");
    assert.equal(nextPurchaseBoardColumn("quoted"), "ordered");
  });

  it("returns null after the last board column (never advances to completed)", () => {
    assert.equal(nextPurchaseBoardColumn("ordered"), null);
  });

  it("returns null for a status outside the purchase board columns", () => {
    assert.equal(nextPurchaseBoardColumn("scheduled"), null);
    assert.equal(nextPurchaseBoardColumn("completed"), null);
  });
});
