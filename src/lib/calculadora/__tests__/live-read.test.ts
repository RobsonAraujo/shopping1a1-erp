import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blockedFromRow } from "@/lib/calculadora/live-read";
import {
  calculatorAdsSchema,
  calculatorFloorSchema,
  calculatorSimulateSchema,
} from "@/lib/calculadora/request-schema";

describe("blockedFromRow", () => {
  it("blocks on missing cost, tax or kit parts, not on an unquoted price", () => {
    assert.equal(blockedFromRow({ kitMissingSkus: [], productCost: 10, taxRatePercent: 9 }), null);
    assert.equal(
      blockedFromRow({ kitMissingSkus: ["A"], productCost: 10, taxRatePercent: 9 }),
      "kit_incomplete",
    );
    assert.equal(
      blockedFromRow({ kitMissingSkus: [], productCost: null, taxRatePercent: 9 }),
      "missing_cost",
    );
    assert.equal(
      blockedFromRow({ kitMissingSkus: [], productCost: 10, taxRatePercent: null }),
      "missing_tax",
    );
  });
});

describe("calculator request schemas", () => {
  const body = {
    mlItemId: "MLB1",
    inputs: {
      productCost: 50,
      extraCosts: 0,
      taxRatePercent: 10,
      mlFeeRebate: null,
      listingTypeId: "gold_special",
      listingTypeLabel: "Clássico",
      adsMetricsAvailable: true,
      tacosPercent: 4,
      adsCost: 8,
      adsUnitsSold: 2,
    },
    salePrice: 100,
    regularPrice: null,
    pmaPrice: null,
    targetPercent: 8,
    blocked: null,
    readAt: "2026-11-18T17:32:00.000Z",
    prices: [89.9],
  };

  it("accepts the reading sent back with the prices", () => {
    assert.equal(calculatorSimulateSchema.safeParse(body).success, true);
  });

  it("accepts a negative tax rate (ST credit bigger than the sale's ICMS)", () => {
    const negative = { ...body, inputs: { ...body.inputs, taxRatePercent: -2.36 } };
    assert.equal(calculatorSimulateSchema.safeParse(negative).success, true);
    assert.equal(calculatorFloorSchema.safeParse(negative).success, true);
    assert.equal(
      calculatorSimulateSchema.safeParse({ ...body, inputs: { ...body.inputs, taxRatePercent: -150 } })
        .success,
      false,
    );
  });

  it("rejects inputs out of range and more than 5 prices", () => {
    assert.equal(
      calculatorSimulateSchema.safeParse({ ...body, inputs: { ...body.inputs, taxRatePercent: 150 } })
        .success,
      false,
    );
    assert.equal(
      calculatorSimulateSchema.safeParse({ ...body, prices: [1, 2, 3, 4, 5, 6] }).success,
      false,
    );
    assert.equal(calculatorSimulateSchema.safeParse({ ...body, mlItemId: "123" }).success, false);
  });

  it("only reads the 7-day ADS on demand", () => {
    assert.equal(calculatorAdsSchema.safeParse({ mlItemId: "MLB1", basis: "7d" }).success, true);
    assert.equal(calculatorAdsSchema.safeParse({ mlItemId: "MLB1", basis: "today" }).success, false);
  });
});
