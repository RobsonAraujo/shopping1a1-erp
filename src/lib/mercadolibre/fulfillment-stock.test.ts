import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItemBody } from "@/lib/mercadolibre/types";
import {
  aggregateFulfillmentSnapshots,
  collectInventoryIdsFromItem,
  emptyFulfillmentStock,
  isFulfillmentListing,
  parseFulfillmentStockResponse,
} from "./fulfillment-stock";

function baseItem(overrides: Partial<ItemBody> = {}): ItemBody {
  return {
    id: "MLB1",
    title: "Test",
    price: 10,
    currency_id: "BRL",
    available_quantity: 3,
    sold_quantity: 0,
    status: "active",
    permalink: "https://example.com",
    ...overrides,
  };
}

describe("isFulfillmentListing", () => {
  it("returns true when logistic_type is fulfillment", () => {
    assert.equal(
      isFulfillmentListing(
        baseItem({ shipping: { logistic_type: "fulfillment" } }),
      ),
      true,
    );
  });

  it("returns false for self-ship listings", () => {
    assert.equal(
      isFulfillmentListing(
        baseItem({ shipping: { logistic_type: "self_service" } }),
      ),
      false,
    );
  });
});

describe("collectInventoryIdsFromItem", () => {
  it("collects item and variation inventory ids uniquely", () => {
    const ids = collectInventoryIdsFromItem(
      baseItem({
        inventory_id: "INV-A",
        variations: [
          { id: 1, inventory_id: "INV-B" },
          { id: 2, inventory_id: "INV-B" },
        ],
      }),
    );
    assert.deepEqual(ids.sort(), ["INV-A", "INV-B"]);
  });
});

describe("parseFulfillmentStockResponse", () => {
  it("extracts transfer and internal_process from not_available_detail", () => {
    const parsed = parseFulfillmentStockResponse({
      inventory_id: "LCQI05831",
      total: 8,
      available_quantity: 5,
      not_available_quantity: 3,
      not_available_detail: [
        { status: "transfer", quantity: 2 },
        { status: "internal_process", quantity: 1 },
        { status: "damage", quantity: 4 },
      ],
    });
    assert.equal(parsed.available, 5);
    assert.equal(parsed.inTransfer, 2);
    assert.equal(parsed.internalProcess, 1);
    assert.equal(parsed.otherNotAvailable, 4);
    assert.equal(parsed.totalAtMl, 8);
  });

  it("falls back to not_available_quantity when detail is missing", () => {
    const parsed = parseFulfillmentStockResponse({
      available_quantity: 2,
      not_available_quantity: 3,
      total: 5,
    });
    assert.equal(parsed.available, 2);
    assert.equal(parsed.inTransfer, 0);
    assert.equal(parsed.internalProcess, 0);
    assert.equal(parsed.otherNotAvailable, 3);
    assert.equal(parsed.totalAtMl, 5);
  });

  it("returns zeros for invalid payloads", () => {
    assert.deepEqual(parseFulfillmentStockResponse(null), emptyFulfillmentStock());
  });

  it("parses Gorilla probe fixture (transfer only, no pending inbound in API)", () => {
    const parsed = parseFulfillmentStockResponse({
      inventory_id: "YYKB51347",
      available_quantity: 230,
      not_available_quantity: 11,
      not_available_detail: [{ status: "transfer", quantity: 11 }],
      total: 241,
    });
    assert.equal(parsed.available, 230);
    assert.equal(parsed.inTransfer, 11);
    assert.equal(parsed.internalProcess, 0);
    assert.equal(parsed.totalAtMl, 241);
    const aggregated = aggregateFulfillmentSnapshots([parsed]);
    assert.equal(aggregated.inProcess, 11);
  });
});

describe("aggregateFulfillmentSnapshots", () => {
  it("sums snapshots and computes inProcess", () => {
    const aggregated = aggregateFulfillmentSnapshots([
      {
        available: 1,
        inTransfer: 2,
        internalProcess: 1,
        otherNotAvailable: 0,
        totalAtMl: 4,
      },
      {
        available: 3,
        inTransfer: 1,
        internalProcess: 0,
        otherNotAvailable: 2,
        totalAtMl: 6,
      },
    ]);
    assert.equal(aggregated.available, 4);
    assert.equal(aggregated.inTransfer, 3);
    assert.equal(aggregated.internalProcess, 1);
    assert.equal(aggregated.inProcess, 4);
    assert.equal(aggregated.otherNotAvailable, 2);
    assert.equal(aggregated.totalAtMl, 10);
  });
});
