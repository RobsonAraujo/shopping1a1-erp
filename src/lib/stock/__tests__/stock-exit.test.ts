import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { lotEffect } from "../stock-lots";
import { EXIT_REASONS, isExitReason, planStockExit } from "../stock-exit";

describe("planStockExit", () => {
  it("Envio ao Full só muda de lugar: full_transfer, sem mexer no lote", () => {
    const drafts = planStockExit("envio_full", [
      { stockItemId: "a", quantity: 5 },
      { stockItemId: "b", quantity: 2 },
    ]);
    assert.deepEqual(
      drafts.map((d) => [d.stockItemId, d.type, d.quantity, d.reason]),
      [
        ["a", "full_transfer", -5, "Envio ao Full"],
        ["b", "full_transfer", -2, "Envio ao Full"],
      ],
    );
    for (const d of drafts) assert.equal(lotEffect(d), 0);
  });

  it("perda, avaria, brinde… saem de vez e consomem o lote", () => {
    const [draft] = planStockExit("perda", [{ stockItemId: "a", quantity: 1 }]);
    assert.equal(draft.type, "manual_out");
    assert.equal(draft.quantity, -1);
    assert.equal(draft.reason, "Perda ou extravio");
    assert.equal(lotEffect(draft), 1);
  });

  it("the same product twice gets two lines (unique keys)", () => {
    const drafts = planStockExit("envio_full", [
      { stockItemId: "a", quantity: 1 },
      { stockItemId: "a", quantity: 3 },
    ]);
    assert.notEqual(drafts[0].sourceLineKey, drafts[1].sourceLineKey);
  });

  it("ignores empty quantities", () => {
    assert.equal(planStockExit("outro", [{ stockItemId: "a", quantity: 0 }]).length, 0);
  });

  it("Voltou do Full volta para casa sem mexer no lote", () => {
    assert.equal(lotEffect({ type: "full_return", quantity: 4 }), 0);
  });

  it("reason keys", () => {
    assert.equal(isExitReason("envio_full"), true);
    assert.equal(isExitReason("nope"), false);
    assert.equal(Object.keys(EXIT_REASONS)[0], "envio_full");
  });
});
