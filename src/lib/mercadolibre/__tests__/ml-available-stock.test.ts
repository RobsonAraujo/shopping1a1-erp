import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mlAvailableStockUnits } from "../ml-available-stock";
import type { ItemBody } from "../types";

function item(overrides: Partial<ItemBody> = {}): ItemBody {
  return { id: "MLB1", title: "Item", status: "active", ...overrides } as ItemBody;
}

describe("mlAvailableStockUnits", () => {
  it("sums variations quantities when present", () => {
    const it1 = item({
      variations: [
        { available_quantity: 3 },
        { available_quantity: 2 },
      ],
    } as Partial<ItemBody>);
    assert.equal(mlAvailableStockUnits(it1), 5);
  });

  it("ignores non-finite variation quantities but keeps valid ones", () => {
    const it1 = item({
      variations: [
        { available_quantity: Number.NaN },
        { available_quantity: 4 },
      ],
    } as Partial<ItemBody>);
    assert.equal(mlAvailableStockUnits(it1), 4);
  });

  it("floors and clamps negative variation quantities to 0", () => {
    const it1 = item({
      variations: [{ available_quantity: 2.9 }, { available_quantity: -5 }],
    } as Partial<ItemBody>);
    assert.equal(mlAvailableStockUnits(it1), 2);
  });

  it("falls back to available_quantity when there are no variations", () => {
    const it1 = item({ available_quantity: 7 } as Partial<ItemBody>);
    assert.equal(mlAvailableStockUnits(it1), 7);
  });

  it("falls back to available_quantity when variations array is empty", () => {
    const it1 = item({ variations: [], available_quantity: 9 } as Partial<ItemBody>);
    assert.equal(mlAvailableStockUnits(it1), 9);
  });

  it("returns 0 when nothing is available", () => {
    assert.equal(mlAvailableStockUnits(item()), 0);
  });

  it("returns 0 for a non-finite top-level available_quantity", () => {
    const it1 = item({ available_quantity: Number.NaN } as Partial<ItemBody>);
    assert.equal(mlAvailableStockUnits(it1), 0);
  });
});
