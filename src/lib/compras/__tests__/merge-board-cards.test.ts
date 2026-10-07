import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergeOperationsBoardCards,
  patchOperationsBoardCardsSales,
} from "@/lib/compras/replenishment-cycle";
import type { OperationsBoardCard } from "@/lib/compras/replenishment-cycle-data";

function card(overrides: Partial<OperationsBoardCard>): OperationsBoardCard {
  return {
    cycleId: "c1",
    mlItemId: "MLB1",
    kind: "full",
    status: "attention",
    columnId: "col-a",
    columnLabel: "A",
    columnPosition: 0,
    position: 1024,
    title: "Item",
    sku: null,
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
    updatedAt: "2026-01-01T00:00:00.000Z",
    salesPending: false,
    ...overrides,
  };
}

const SALES_PATCH = {
  purchaseIsOverdue: true,
  searchIsOverdue: true,
  purchaseStartsOn: null,
  searchStartsOn: null,
  purchaseStartsOnTooltip: "",
  searchStartsOnTooltip: "",
  salesPending: false as const,
};

describe("mergeOperationsBoardCards", () => {
  it("incoming é a fonte da verdade (inclusive pra remover card)", () => {
    const merged = mergeOperationsBoardCards(
      [card({ cycleId: "c1" }), card({ cycleId: "gone" })],
      [card({ cycleId: "c1", columnId: "col-b", updatedAt: "2026-01-02T00:00:00.000Z" })],
    );
    assert.deepEqual(
      merged.map((c) => [c.cycleId, c.columnId]),
      [["c1", "col-b"]],
    );
  });

  it("local mais novo vence um snapshot mais velho", () => {
    const local = card({ columnId: "col-b", updatedAt: "2026-01-03T00:00:00.000Z" });
    const [merged] = mergeOperationsBoardCards([local], [card({ updatedAt: "2026-01-02T00:00:00.000Z" })]);
    assert.equal(merged, local);
  });

  it("card com movimento em voo mantém a versão local mesmo com updatedAt igual", () => {
    // O otimista não muda updatedAt — sem `pendingIds`, um resync que partiu
    // antes do drag devolveria o card pra coluna antiga.
    const local = card({ columnId: "col-b", position: 5 });
    const [merged] = mergeOperationsBoardCards([local], [card({})], new Set(["c1"]));
    assert.equal(merged, local);
    const [unpending] = mergeOperationsBoardCards([local], [card({})], new Set());
    assert.equal(unpending.columnId, "col-a");
  });
});

describe("patchOperationsBoardCardsSales", () => {
  it("devolve o mesmo array quando nenhum card bate (setState vira no-op)", () => {
    const cards = [card({})];
    assert.equal(patchOperationsBoardCardsSales(cards, new Map([["MLB-outro", SALES_PATCH]])), cards);
  });

  it("aplica o patch só no card do item", () => {
    const cards = [card({}), card({ cycleId: "c2", mlItemId: "MLB2" })];
    const next = patchOperationsBoardCardsSales(cards, new Map([["MLB1", SALES_PATCH]]));
    assert.notEqual(next, cards);
    assert.equal(next[0].searchIsOverdue, true);
    assert.equal(next[1], cards[1]);
  });
});
