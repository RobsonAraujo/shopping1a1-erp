import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseShipmentCostResponse } from "@/lib/tax-report/ml/shipment-cost-client";

describe("parseShipmentCostResponse", () => {
  it("reads the cost paid by the seller (senders[0].cost)", () => {
    const cost = parseShipmentCostResponse({
      senders: [{ cost: 12.5 }],
      receiver: { cost: 0 },
    });
    assert.equal(cost, 12.5);
  });

  it("returns null when there is no response", () => {
    assert.equal(parseShipmentCostResponse(null), null);
  });

  it("returns null when senders is empty or cost is missing", () => {
    assert.equal(parseShipmentCostResponse({ senders: [] }), null);
    assert.equal(parseShipmentCostResponse({ senders: [{}] }), null);
  });
});
