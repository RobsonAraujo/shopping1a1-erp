import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { contextWithAds, resolveSimulationPrices } from "@/lib/rotina/simulate";

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

describe("contextWithAds", () => {
  it("swaps only the ADS fields: the Central's floor with today's TACOS", () => {
    const ctx = {
      mlItemId: "MLB1",
      item: { id: "MLB1" } as never,
      targetPercent: 2,
      inputs: {
        productCost: 50,
        extraCosts: 0,
        taxRatePercent: 10,
        mlFeeRebate: 1.5,
        listingTypeId: "gold_special",
        listingTypeLabel: "Clássico",
        adsMetricsAvailable: true,
        tacosPercent: 6,
        adsCost: 42,
        adsUnitsSold: 7,
      },
      inputsFrom: "refresh" as const,
      inputsAt: "2026-11-19T12:00:00.000Z",
      blocked: null,
      listing: {
        salePrice: 100,
        regularPrice: null,
        pmaPrice: 90,
        adsAvailable: true,
        tacosPercent: 6,
        adsCost: 42,
      },
    };
    const today = contextWithAds(ctx, {
      basis: "today",
      from: "2026-11-19",
      to: "2026-11-19",
      available: true,
      tacosPercent: 2.5,
      adsCost: 5,
      adsUnitsSold: 2,
      status: "active",
    });
    assert.equal(today.inputs.tacosPercent, 2.5);
    assert.equal(today.inputs.adsCost, 5);
    assert.equal(today.inputs.mlFeeRebate, 1.5);
    assert.equal(today.inputs.productCost, 50);
    assert.equal(today.listing.tacosPercent, 2.5);
    assert.equal(today.listing.pmaPrice, 90);
    assert.equal(ctx.inputs.tacosPercent, 6, "o contexto original não muda");
  });
});
