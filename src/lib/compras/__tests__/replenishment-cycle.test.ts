import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStatusTransition,
  isCompletedCycleStillValid,
  nextStatusForKind,
  shouldAutoCompleteFullCycle,
  shouldAutoCompletePurchaseCycle,
  shouldCreateFullCycle,
  shouldCreatePurchaseCycle,
  summarizeOperationsCounts,
} from "@/lib/compras/replenishment-cycle";
import type { ReplenishmentCycleRecord } from "@/lib/compras/replenishment-cycle";

function cycle(
  overrides: Partial<ReplenishmentCycleRecord> & {
    kind: ReplenishmentCycleRecord["kind"];
    status: ReplenishmentCycleRecord["status"];
  },
): ReplenishmentCycleRecord {
  return {
    id: "c1",
    mlItemId: "MLB1",
    triggerMlQty: 5,
    triggerWarehouseQty: 2,
    triggerLeadTimeDays: 7,
    warehouseQtyAtOrder: null,
    mlQtyAtCollection: null,
    completedMlQty: null,
    completedWarehouseQty: null,
    completedLeadTimeDays: null,
    completedAt: null,
    ...overrides,
  };
}

describe("replenishment-cycle", () => {
  it("advances purchase flow", () => {
    assert.equal(nextStatusForKind("purchase", "attention"), "analyzing");
    assert.equal(nextStatusForKind("purchase", "quoted"), "ordered");
    assert.equal(nextStatusForKind("purchase", "ordered"), "completed");
  });

  it("advances full flow", () => {
    assert.equal(nextStatusForKind("full", "attention"), "scheduled");
    assert.equal(nextStatusForKind("full", "scheduled"), "collected");
    assert.equal(nextStatusForKind("full", "collected"), "completed");
  });

  it("records ml baseline when entering collected (full)", () => {
    const patch = buildStatusTransition(
      cycle({ kind: "full", status: "scheduled" }),
      "collected",
      { mlQty: 4, warehouseQty: 12, leadTimeDays: 14 },
    );
    assert.equal(patch.status, "collected");
    assert.equal(patch.mlQtyAtCollection, 4);
    assert.equal(patch.completedMlQty, undefined);
  });

  it("auto-completes full at entrada when scheduling need resolved", () => {
    assert.equal(
      shouldAutoCompleteFullCycle(
        cycle({ kind: "full", status: "attention" }),
        { mlQty: 2, warehouseQty: 10, leadTimeDays: 7 },
        false,
      ),
      true,
    );
  });

  it("auto-completes full from collected when ml stock rises", () => {
    assert.equal(
      shouldAutoCompleteFullCycle(
        cycle({
          kind: "full",
          status: "collected",
          mlQtyAtCollection: 3,
        }),
        { mlQty: 5, warehouseQty: 10, leadTimeDays: 7 },
        true,
      ),
      true,
    );
    assert.equal(
      shouldAutoCompleteFullCycle(
        cycle({
          kind: "full",
          status: "collected",
          mlQtyAtCollection: 3,
        }),
        { mlQty: 3, warehouseQty: 10, leadTimeDays: 7 },
        true,
      ),
      false,
    );
  });

  it("does not auto-complete purchase cycles via full helper", () => {
    assert.equal(
      shouldAutoCompleteFullCycle(
        cycle({ kind: "purchase", status: "attention" }),
        { mlQty: 2, warehouseQty: 10, leadTimeDays: 7 },
        false,
      ),
      false,
    );
  });

  it("does not create purchase cycle when completed snapshot still valid", () => {
    const completed = cycle({
      kind: "purchase",
      status: "completed",
      completedMlQty: 3,
      completedWarehouseQty: 10,
      completedLeadTimeDays: 7,
      completedAt: new Date(),
    });

    assert.equal(
      shouldCreatePurchaseCycle(
        {
          needsPurchaseAttention: true,
          snapshot: { mlQty: 3, warehouseQty: 10, leadTimeDays: 7 },
          purchaseStartsAtMs: Date.now(),
        },
        completed,
      ),
      false,
    );
    assert.equal(
      isCompletedCycleStillValid(completed, {
        mlQty: 3,
        warehouseQty: 10,
        leadTimeDays: 7,
      }),
      true,
    );
  });

  it("creates purchase cycle when snapshot changed after completion", () => {
    const completed = cycle({
      kind: "purchase",
      status: "completed",
      completedMlQty: 3,
      completedWarehouseQty: 10,
      completedLeadTimeDays: 7,
      completedAt: new Date(),
    });

    assert.equal(
      shouldCreatePurchaseCycle(
        {
          needsPurchaseAttention: true,
          snapshot: { mlQty: 1, warehouseQty: 10, leadTimeDays: 7 },
          purchaseStartsAtMs: Date.now(),
        },
        completed,
      ),
      true,
    );
  });

  it("auto-completes purchase at entrada when need resolved (Gorilla)", () => {
    assert.equal(
      shouldAutoCompletePurchaseCycle(
        cycle({ kind: "purchase", status: "attention" }),
        { mlQty: 2, warehouseQty: 185, leadTimeDays: 7 },
        false,
      ),
      true,
    );
  });

  it("auto-completes purchase from ordered when warehouse stock rises", () => {
    assert.equal(
      shouldAutoCompletePurchaseCycle(
        cycle({
          kind: "purchase",
          status: "ordered",
          warehouseQtyAtOrder: 5,
        }),
        { mlQty: 2, warehouseQty: 8, leadTimeDays: 7 },
        true,
      ),
      true,
    );
    assert.equal(
      shouldAutoCompletePurchaseCycle(
        cycle({
          kind: "purchase",
          status: "ordered",
          warehouseQtyAtOrder: 5,
        }),
        { mlQty: 2, warehouseQty: 5, leadTimeDays: 7 },
        true,
      ),
      false,
    );
  });

  it("does not auto-complete full via purchase helper", () => {
    assert.equal(
      shouldAutoCompletePurchaseCycle(
        cycle({ kind: "full", status: "attention" }),
        { mlQty: 2, warehouseQty: 10, leadTimeDays: 7 },
        false,
      ),
      false,
    );
  });

  it("creates full cycle only when scheduling attention needed", () => {
    assert.equal(
      shouldCreateFullCycle(
        {
          needsSchedulingAttention: true,
          snapshot: { mlQty: 1, warehouseQty: 0, leadTimeDays: 7 },
        },
        null,
      ),
      true,
    );
    assert.equal(
      shouldCreateFullCycle(
        {
          needsSchedulingAttention: false,
          snapshot: { mlQty: 1, warehouseQty: 0, leadTimeDays: 7 },
        },
        null,
      ),
      false,
    );
  });

  it("records completion snapshot on transition", () => {
    const patch = buildStatusTransition(
      cycle({ kind: "full", status: "collected", mlQtyAtCollection: 3 }),
      "completed",
      { mlQty: 4, warehouseQty: 12, leadTimeDays: 14 },
    );
    assert.equal(patch.status, "completed");
    assert.equal(patch.completedMlQty, 4);
    assert.equal(patch.completedWarehouseQty, 12);
    assert.equal(patch.completedLeadTimeDays, 14);
    assert.ok(patch.completedAt);
  });

  it("records warehouse baseline when entering ordered", () => {
    const patch = buildStatusTransition(
      cycle({ kind: "purchase", status: "quoted" }),
      "ordered",
      { mlQty: 4, warehouseQty: 12, leadTimeDays: 14 },
    );
    assert.equal(patch.warehouseQtyAtOrder, 12);
  });

  it("summarizes counts per kind", () => {
    const summary = summarizeOperationsCounts([
      { kind: "purchase", status: "attention" },
      { kind: "purchase", status: "ordered" },
      { kind: "full", status: "attention" },
      { kind: "full", status: "scheduled" },
      { kind: "purchase", status: "completed" },
    ]);
    assert.equal(summary.purchase.attention, 1);
    assert.equal(summary.purchase.ordered, 1);
    assert.equal(summary.full.attention, 1);
    assert.equal(summary.full.scheduled, 1);
    assert.equal(summary.totalActive, 4);
  });
});
