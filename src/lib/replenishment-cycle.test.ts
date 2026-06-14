import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildStatusTransition,
  isCompletedCycleStillValid,
  nextReplenishmentStatus,
  shouldAutoAdvanceToWarehouse,
  shouldCreateReplenishmentCycle,
  summarizeOperationsCounts,
} from "@/lib/replenishment-cycle";
import type { ReplenishmentCycleRecord } from "@/lib/replenishment-cycle";

function cycle(
  overrides: Partial<ReplenishmentCycleRecord> & {
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
    completedMlQty: null,
    completedWarehouseQty: null,
    completedLeadTimeDays: null,
    completedAt: null,
    ...overrides,
  };
}

describe("replenishment-cycle", () => {
  it("advances through purchase flow", () => {
    assert.equal(nextReplenishmentStatus("attention"), "analyzing");
    assert.equal(nextReplenishmentStatus("quoted"), "ordered");
    assert.equal(nextReplenishmentStatus("ordered"), "in_warehouse");
  });

  it("skips Full when requested", () => {
    assert.equal(
      nextReplenishmentStatus("in_warehouse", { skipFull: true }),
      "completed",
    );
    assert.equal(nextReplenishmentStatus("in_warehouse"), "full_pending");
  });

  it("does not create cycle when completed snapshot still valid", () => {
    const completed = cycle({
      status: "completed",
      completedMlQty: 3,
      completedWarehouseQty: 10,
      completedLeadTimeDays: 7,
      completedAt: new Date(),
    });

    assert.equal(
      shouldCreateReplenishmentCycle(
        {
          needsPurchaseAttention: true,
          needsSchedulingAttention: false,
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

  it("creates cycle when snapshot changed after completion", () => {
    const completed = cycle({
      status: "completed",
      completedMlQty: 3,
      completedWarehouseQty: 10,
      completedLeadTimeDays: 7,
      completedAt: new Date(),
    });

    assert.equal(
      shouldCreateReplenishmentCycle(
        {
          needsPurchaseAttention: true,
          needsSchedulingAttention: false,
          snapshot: { mlQty: 1, warehouseQty: 10, leadTimeDays: 7 },
          purchaseStartsAtMs: Date.now(),
        },
        completed,
      ),
      true,
    );
  });

  it("auto-advances warehouse only from ordered with baseline", () => {
    assert.equal(
      shouldAutoAdvanceToWarehouse(
        cycle({ status: "ordered", warehouseQtyAtOrder: 5 }),
        8,
      ),
      true,
    );
    assert.equal(
      shouldAutoAdvanceToWarehouse(
        cycle({ status: "quoted", warehouseQtyAtOrder: 5 }),
        8,
      ),
      false,
    );
    assert.equal(
      shouldAutoAdvanceToWarehouse(
        cycle({ status: "ordered", warehouseQtyAtOrder: 5 }),
        5,
      ),
      false,
    );
  });

  it("records completion snapshot on transition", () => {
    const patch = buildStatusTransition(
      cycle({ status: "full_pending" }),
      "completed",
      { mlQty: 4, warehouseQty: 12, leadTimeDays: 14 },
    );
    assert.equal(patch.status, "completed");
    assert.equal(patch.completedMlQty, 4);
    assert.equal(patch.completedWarehouseQty, 12);
    assert.equal(patch.completedLeadTimeDays, 14);
    assert.ok(patch.completedAt);
  });

  it("summarizes active counts", () => {
    const summary = summarizeOperationsCounts([
      "attention",
      "attention",
      "ordered",
      "in_warehouse",
      "completed",
    ]);
    assert.equal(summary.attention, 2);
    assert.equal(summary.ordered, 1);
    assert.equal(summary.inWarehouse, 1);
    assert.equal(summary.totalActive, 4);
  });
});
