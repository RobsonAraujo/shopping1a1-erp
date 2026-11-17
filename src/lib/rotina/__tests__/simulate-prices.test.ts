import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSimulationPrices } from "@/lib/rotina/simulate";

describe("resolveSimulationPrices", () => {
  it("rounds and dedupes the requested prices", () => {
    assert.deepEqual(resolveSimulationPrices([47.904, 47.9, 50], 99), [47.9, 50]);
  });

  it("falls back to today's price when no price is requested", () => {
    assert.deepEqual(resolveSimulationPrices(undefined, 89.9), [89.9]);
    assert.deepEqual(resolveSimulationPrices([], 89.9), [89.9]);
  });

  it("simulates nothing without a price to use", () => {
    assert.deepEqual(resolveSimulationPrices(undefined, null), []);
  });
});
