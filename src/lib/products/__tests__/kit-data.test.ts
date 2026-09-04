import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveKitPricing, type KitComponent } from "../kit-data";
import type { ResolvedProductPricing } from "../../pricing/product-pricing";

function pricing(pricingCost: number, extraCosts = 0, taxPercent = 0): ResolvedProductPricing {
  return { pricingCost, extraCosts, taxPercent };
}

describe("resolveKitPricing", () => {
  it("sums cost/extraCosts of components weighted by quantity", () => {
    const components: KitComponent[] = [
      { sku: "A", quantity: 2 },
      { sku: "B", quantity: 3 },
    ];
    const pricingBySku = new Map([
      ["A", pricing(10, 1)],
      ["B", pricing(5, 0.5)],
    ]);
    const result = resolveKitPricing(components, pricingBySku, new Map());
    assert.equal(result.productCost, 2 * 10 + 3 * 5);
    assert.equal(result.extraCosts, 2 * 1 + 3 * 0.5);
  });

  it("reports missing skus and excludes them from cost totals", () => {
    const components: KitComponent[] = [
      { sku: "A", quantity: 1 },
      { sku: "MISSING", quantity: 1 },
    ];
    const pricingBySku = new Map([["A", pricing(10)]]);
    const result = resolveKitPricing(components, pricingBySku, new Map());
    assert.deepEqual(result.missingSkus, ["MISSING"]);
    assert.equal(result.productCost, 10);
  });

  it("computes a cost-weighted average tax rate across components with known tax", () => {
    const components: KitComponent[] = [
      { sku: "A", quantity: 1 }, // cost 100, tax 10%
      { sku: "B", quantity: 1 }, // cost 100, tax 20%
    ];
    const pricingBySku = new Map([
      ["A", pricing(100)],
      ["B", pricing(100)],
    ]);
    const taxBySku = new Map([
      ["A", 10],
      ["B", 20],
    ]);
    const result = resolveKitPricing(components, pricingBySku, taxBySku);
    assert.equal(result.taxRatePercent, 15); // (10+20)/(100+100)*100
  });

  it("weighs the tax average by cost, not a simple average", () => {
    const components: KitComponent[] = [
      { sku: "SMALL", quantity: 1 }, // cost 10, tax 50%
      { sku: "BIG", quantity: 1 }, // cost 990, tax 10%
    ];
    const pricingBySku = new Map([
      ["SMALL", pricing(10)],
      ["BIG", pricing(990)],
    ]);
    const taxBySku = new Map([
      ["SMALL", 50],
      ["BIG", 10],
    ]);
    const result = resolveKitPricing(components, pricingBySku, taxBySku);
    // total tax = 10*0.5 + 990*0.1 = 5 + 99 = 104; total cost = 1000 => 10.4%
    assert.equal(result.taxRatePercent, 10.4);
  });

  it("returns null taxRatePercent when no component has a known tax rate", () => {
    const components: KitComponent[] = [{ sku: "A", quantity: 1 }];
    const pricingBySku = new Map([["A", pricing(10)]]);
    const result = resolveKitPricing(components, pricingBySku, new Map());
    assert.equal(result.taxRatePercent, null);
  });

  it("normalizes whitespace in component skus before looking up pricing", () => {
    const components: KitComponent[] = [{ sku: "  a-1   b  ", quantity: 1 }];
    const pricingBySku = new Map([["a-1 b", pricing(10)]]);
    const result = resolveKitPricing(components, pricingBySku, new Map());
    assert.equal(result.productCost, 10);
    assert.deepEqual(result.missingSkus, []);
  });

  it("handles an empty components list", () => {
    const result = resolveKitPricing([], new Map(), new Map());
    assert.equal(result.productCost, 0);
    assert.equal(result.extraCosts, 0);
    assert.equal(result.taxRatePercent, null);
    assert.deepEqual(result.missingSkus, []);
  });
});
