import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adsFromLoad, blockedFromRow } from "@/lib/calculadora/live-read";
import {
  calculatorAdsSchema,
  calculatorSimulateSchema,
} from "@/lib/calculadora/request-schema";

const range = { dateFrom: "2026-11-18", dateTo: "2026-11-18" };

describe("adsFromLoad", () => {
  it("reads the item's metrics in the window", () => {
    const ads = adsFromLoad(
      {
        available: true,
        unavailableReason: null,
        map: new Map([
          [
            "MLB1",
            {
              itemId: "MLB1",
              status: "active",
              cost: 6,
              acosPercent: 12,
              totalAmount: 50,
              organicAmount: 100,
              unitsQuantity: 1,
              totalRevenue: 150,
              tacosPercent: 4,
            },
          ],
        ]),
      },
      "MLB1",
      "today",
      range,
    );
    assert.deepEqual(ads, {
      basis: "today",
      from: "2026-11-18",
      to: "2026-11-18",
      available: true,
      tacosPercent: 4,
      adsCost: 6,
      adsUnitsSold: 1,
      status: "active",
    });
  });

  it("counts no row in the window as no spend (TACOS 0%), like the Lucratividade", () => {
    const ads = adsFromLoad({ available: true, unavailableReason: null, map: new Map() }, "MLB1", "7d", range);
    assert.equal(ads.tacosPercent, 0);
    assert.equal(ads.adsCost, 0);
    assert.equal(ads.status, null);
  });

  it("marks Product Ads down as unavailable: the margin decides by MC", () => {
    const ads = adsFromLoad(
      { available: false, unavailableReason: "api_error", map: new Map() },
      "MLB1",
      "today",
      range,
    );
    assert.equal(ads.available, false);
    assert.equal(ads.tacosPercent, null);
  });
});

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
