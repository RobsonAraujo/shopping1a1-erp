import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lotEffect, planConsumption, type LotState } from "../stock-lots";

const t = (day: number) => new Date(Date.UTC(2026, 10, day));
const lot = (id: string, status: LotState["status"], quantity: number, consumedQty: number, day: number): LotState => ({
  id,
  status,
  quantity,
  consumedQty,
  receivedAt: t(day),
  createdAt: t(day),
});

describe("lotEffect", () => {
  it("sales and manual outs consume; reversals and returns give back; moves do nothing", () => {
    assert.equal(lotEffect({ type: "sale", quantity: -2 }), 2);
    assert.equal(lotEffect({ type: "manual_out", quantity: -1 }), 1);
    assert.equal(lotEffect({ type: "adjustment", quantity: -3 }), 3);
    assert.equal(lotEffect({ type: "adjustment", quantity: 3 }), -3);
    assert.equal(lotEffect({ type: "sale_reversal", quantity: 2 }), -2);
    assert.equal(lotEffect({ type: "return_in", quantity: 1 }), -1);
    assert.equal(lotEffect({ type: "full_transfer", quantity: -50 }), 0);
    assert.equal(lotEffect({ type: "full_return", quantity: 16 }), 0);
    assert.equal(lotEffect({ type: "entry", quantity: 100 }), 0);
    assert.equal(lotEffect({ type: "opening", quantity: 100 }), 0);
  });
});

describe("planConsumption (PEPS)", () => {
  // Exemplo do pedido: 500 un a R$ 10 em estoque, entram 1.000 a R$ 12.
  const lots = [lot("old", "active", 500, 0, 1), lot("new", "queued", 1000, 0, 10)];

  it("keeps the old cost while the old lot lasts", () => {
    const plan = planConsumption(lots, 300);
    assert.deepEqual(plan.steps, [{ lotId: "old", quantity: 300 }]);
    assert.equal(plan.currentLotId, "old");
    assert.deepEqual(plan.depleted, []);
  });

  it("switches to the new lot exactly when the old one runs out", () => {
    const plan = planConsumption([lot("old", "active", 500, 300, 1), lot("new", "queued", 1000, 0, 10)], 250);
    assert.deepEqual(plan.steps, [
      { lotId: "old", quantity: 200 },
      { lotId: "new", quantity: 50 },
    ]);
    assert.deepEqual(plan.depleted, ["old"]);
    assert.equal(plan.currentLotId, "new");
  });

  it("when everything runs out, the last lot stays as the cost reference", () => {
    const plan = planConsumption([lot("only", "active", 5, 3, 1)], 4);
    assert.deepEqual(plan.steps, [{ lotId: "only", quantity: 2 }]);
    assert.equal(plan.unallocated, 2);
    assert.equal(plan.currentLotId, "only");
    assert.deepEqual(plan.depleted, []);
  });

  it("an entry over an exhausted lot makes the new cost current right away (0 units)", () => {
    const plan = planConsumption([lot("old", "active", 5, 5, 1), lot("new", "queued", 20, 0, 12)], 0);
    assert.equal(plan.currentLotId, "new");
    assert.deepEqual(plan.depleted, ["old"]);
    assert.deepEqual(plan.steps, []);
  });

  it("queued lots are consumed in arrival order", () => {
    const plan = planConsumption(
      [lot("b", "queued", 10, 0, 15), lot("a", "active", 1, 0, 1), lot("c", "queued", 10, 0, 12)],
      6,
    );
    assert.deepEqual(plan.steps.map((s) => s.lotId), ["a", "c"]);
    assert.equal(plan.currentLotId, "c");
  });
});
