import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { orderChannel } from "../order-channel";
import { parseShipmentLogisticType } from "../shipment-logistic";

describe("orderChannel", () => {
  it("is b2b by tag or by flow (ML sends both on business orders)", () => {
    assert.equal(
      orderChannel({ tags: ["b2b", "price_per_quantity", "paid"], context: { flows: ["catalog", "b2b"] } }),
      "b2b",
    );
    assert.equal(orderChannel({ tags: ["paid"], context: { flows: ["b2b"] } }), "b2b");
    assert.equal(orderChannel({ tags: ["b2b"] }), "b2b");
  });

  it("is retail otherwise, including catalog and free-shipping flows", () => {
    assert.equal(orderChannel({ tags: ["catalog", "paid"], context: { flows: ["catalog"] } }), "retail");
    assert.equal(
      orderChannel({ tags: ["paid"], context: { flows: ["new_buyer_free_shipping", "catalog"] } }),
      "retail",
    );
    assert.equal(orderChannel({}), "retail");
    assert.equal(orderChannel({ tags: undefined, context: { flows: null } }), "retail");
  });
});

describe("parseShipmentLogisticType", () => {
  it("reads the new format (x-format-new) and the old one", () => {
    assert.equal(
      parseShipmentLogisticType({ logistic: { mode: "me2", type: "self_service" } }),
      "self_service",
    );
    assert.equal(parseShipmentLogisticType({ logistic_type: "fulfillment" }), "fulfillment");
  });

  it("returns null when the field is missing or empty", () => {
    assert.equal(parseShipmentLogisticType(null), null);
    assert.equal(parseShipmentLogisticType({}), null);
    assert.equal(parseShipmentLogisticType({ logistic: { type: "  " } }), null);
  });
});
