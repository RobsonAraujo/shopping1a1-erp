import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyOperationEnrichment } from "./fulfillment-inbound-operations";

describe("applyOperationEnrichment", () => {
  it("prefers operation date and higher unit totals", () => {
    const shipments = [
      {
        inboundId: "69719031",
        shippedAt: "2026-06-01T12:00:00.000Z",
        totalUnits: 300,
        inventoryIds: ["INV-1"],
      },
    ];

    const ops = new Map([
      [
        "69719031",
        {
          inboundId: "69719031",
          shippedAt: "2026-06-19T17:55:42.000Z",
          totalUnits: 317,
        },
      ],
    ]);

    const enriched = applyOperationEnrichment(shipments, ops);
    assert.equal(enriched[0]?.shippedAt, "2026-06-19T17:55:42.000Z");
    assert.equal(enriched[0]?.totalUnits, 317);
  });

  it("keeps unassigned shipments unchanged", () => {
    const shipments = [
      {
        inboundId: "unassigned-123",
        shippedAt: null,
        totalUnits: 0,
        inventoryIds: [],
      },
    ];
    const enriched = applyOperationEnrichment(shipments, new Map());
    assert.deepEqual(enriched, shipments);
  });
});
