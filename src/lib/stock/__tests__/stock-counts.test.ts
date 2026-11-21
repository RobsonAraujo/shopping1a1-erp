import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countLineAdjustment } from "../stock-counts";

describe("countLineAdjustment", () => {
  it("not counted means no adjustment (blank is not zero)", () => {
    assert.equal(countLineAdjustment({ countedQty: null, expectedOwnQty: 10, pendingShipmentQty: 0 }), null);
  });

  it("counted zero is a real count", () => {
    assert.equal(countLineAdjustment({ countedQty: 0, expectedOwnQty: 3, pendingShipmentQty: 0 }), -3);
  });

  it("sold but not shipped units are still on the shelf", () => {
    // Em casa 8 (já baixou 2 vendas), 2 ainda esperando a coleta: na prateleira tem 10.
    assert.equal(countLineAdjustment({ countedQty: 10, expectedOwnQty: 8, pendingShipmentQty: 2 }), 0);
    assert.equal(countLineAdjustment({ countedQty: 9, expectedOwnQty: 8, pendingShipmentQty: 2 }), -1);
  });

  it("found more than expected", () => {
    assert.equal(countLineAdjustment({ countedQty: 12, expectedOwnQty: 10, pendingShipmentQty: 0 }), 2);
  });
});
