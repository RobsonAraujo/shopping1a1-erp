import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  filterShipmentsByActivityMonth,
  mergeOperationsWithBillingCosts,
} from "./billing-inbound-merge";
import type { InboundOperationDiscovery } from "./fulfillment-inbound-operations";
import type { FullInboundShipment } from "./billing-full-collect-types";

function sampleShipment(
  inboundId: string,
  shippedAt: string,
): FullInboundShipment {
  return {
    inboundId,
    shippedAt,
    totalCost: 10,
    totalUnits: 1,
    productCount: 1,
    chargeDetailIds: [],
    inventoryIds: [],
    label: "Coleta Full",
    source: "full_details",
    unassigned: false,
  };
}

describe("filterShipmentsByActivityMonth", () => {
  it("excludes early-month bleed from previous month when only in current extrato", () => {
    const bleedGuard = {
      currentPeriodKey: "2026-06-01",
      nextPeriodKey: "2026-07-01",
      inboundBillingKeys: new Map([
        ["68093201", new Set(["2026-06-01"])],
        ["68712023", new Set(["2026-07-01"])],
      ]),
    };

    const filtered = filterShipmentsByActivityMonth(
      [
        sampleShipment("68093201", "2026-06-04T06:45:31.000Z"),
        sampleShipment("68712023", "2026-06-11T20:42:24.000Z"),
      ],
      2026,
      6,
      bleedGuard,
    );

    assert.deepEqual(
      filtered.map((row) => row.inboundId),
      ["68712023"],
    );
  });

  it("keeps May coletas billed after day 10 in the same extrato", () => {
    const bleedGuard = {
      currentPeriodKey: "2026-05-01",
      nextPeriodKey: "2026-06-01",
      inboundBillingKeys: new Map([
        ["66022624", new Set(["2026-05-01"])],
        ["66475814", new Set(["2026-05-01"])],
      ]),
    };

    const filtered = filterShipmentsByActivityMonth(
      [
        sampleShipment("66022624", "2026-05-03T00:00:00.000Z"),
        sampleShipment("66475814", "2026-05-12T00:00:00.000Z"),
      ],
      2026,
      5,
      bleedGuard,
    );

    assert.deepEqual(
      filtered.map((row) => row.inboundId),
      ["66475814"],
    );
  });
});

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
