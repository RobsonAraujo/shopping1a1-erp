import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeOperationsWithBillingCosts } from "./billing-inbound-merge";
import type { InboundOperationDiscovery } from "./fulfillment-inbound-operations";

describe("mergeOperationsWithBillingCosts", () => {
  it("merges operation discovery with billing costs by inbound_id", () => {
    const discoveries = new Map<string, InboundOperationDiscovery>([
      [
        "69719031",
        {
          inboundId: "69719031",
          shippedAt: "2026-06-19T14:30:00.000Z",
          totalUnits: 317,
          productCount: 12,
        },
      ],
      [
        "68605584",
        {
          inboundId: "68605584",
          shippedAt: "2026-06-15T10:00:00.000Z",
          totalUnits: 374,
          productCount: 8,
        },
      ],
    ]);

    const shipments = mergeOperationsWithBillingCosts(discoveries, [
      {
        inboundId: "69719031",
        shippedAt: "2026-05-01T00:00:00.000Z",
        totalCost: 186,
        totalUnits: 100,
        productCount: 5,
        chargeDetailIds: ["1"],
        inventoryIds: [],
        label: "Coleta Full",
        source: "full_details",
        unassigned: false,
      },
    ]);

    assert.equal(shipments.length, 2);
    const first = shipments.find((row) => row.inboundId === "69719031");
    const second = shipments.find((row) => row.inboundId === "68605584");
    assert.equal(first?.totalCost, 186);
    assert.equal(first?.totalUnits, 317);
    assert.equal(first?.productCount, 12);
    assert.equal(second?.totalCost, 0);
    assert.equal(second?.totalUnits, 374);
  });
});
