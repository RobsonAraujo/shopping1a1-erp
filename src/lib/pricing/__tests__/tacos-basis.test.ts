import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adsFromLoad,
  inputsForType,
  rescoreWithInputs,
  type TacosAds,
} from "@/lib/pricing/tacos-basis";
import { simulateMarginAtPrice } from "@/lib/rotina/simulate-margin";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

const range = { dateFrom: "2026-11-18", dateTo: "2026-11-18" };

function ads(overrides: Partial<TacosAds> = {}): TacosAds {
  return {
    basis: "today",
    from: "2026-11-18",
    to: "2026-11-18",
    available: true,
    tacosPercent: 4,
    adsCost: 8,
    adsUnitsSold: 2,
    status: "active",
    ...overrides,
  };
}

const inputs: RotinaPricingInputs = {
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
};

describe("adsFromLoad", () => {
  it("reads the item's metrics in the window", () => {
    const result = adsFromLoad(
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
    assert.deepEqual(result, {
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
    const result = adsFromLoad({ available: true, unavailableReason: null, map: new Map() }, "MLB1", "7d", range);
    assert.equal(result.tacosPercent, 0);
    assert.equal(result.adsCost, 0);
    assert.equal(result.status, null);
  });

  it("marks Product Ads down as unavailable: the margin decides by MC", () => {
    const result = adsFromLoad(
      { available: false, unavailableReason: "api_error", map: new Map() },
      "MLB1",
      "today",
      range,
    );
    assert.equal(result.available, false);
    assert.equal(result.tacosPercent, null);
  });
});

describe("rescoreWithInputs", () => {
  it("redoes a quoted price with another TACOS, keeping the quoted fee and shipping", () => {
    const quoted = simulateMarginAtPrice(120, { mlFeeAmount: 14.4, shippingCost: 20 }, inputs, 8);
    const rescored = rescoreWithInputs(
      quoted,
      inputs,
      "gold_special",
      ads({ basis: "7d", tacosPercent: 10 }),
      8,
    );
    assert.equal(rescored.mlFeeAmount, 14.4);
    assert.equal(rescored.shippingCost, 20);
    assert.equal(rescored.marginPercent, quoted.marginPercent);
    assert.equal(
      rescored.marginAfterAdsPercent,
      Math.round(((quoted.marginPercent ?? 0) - 10) * 100) / 100,
    );
  });

  it("keeps the other listing type's fee label", () => {
    const premium = simulateMarginAtPrice(
      100,
      { mlFeeAmount: 17, shippingCost: 0 },
      inputsForType(inputs, "gold_special", "gold_pro"),
      8,
    );
    const rescored = rescoreWithInputs(premium, inputs, "gold_special", ads(), 8);
    assert.equal(rescored.listingTypeId, "gold_pro");
    assert.deepEqual(rescored.lines, premium.lines);
  });

  it("decides by MC when today's ADS spent without selling", () => {
    const quoted = simulateMarginAtPrice(100, { mlFeeAmount: 12, shippingCost: 0 }, inputs, 8);
    const rescored = rescoreWithInputs(
      quoted,
      inputs,
      "gold_special",
      ads({ tacosPercent: null, adsCost: 4.2, adsUnitsSold: 0 }),
      8,
    );
    assert.equal(rescored.decidingBasis, "contribution");
    assert.equal(rescored.marginAfterAdsPercent, null);
  });

  it("leaves a price the ML did not quote as it is", () => {
    const unquoted = simulateMarginAtPrice(80, null, inputs, 8);
    assert.equal(rescoreWithInputs(unquoted, inputs, "gold_special", ads({ tacosPercent: 30 }), 8), unquoted);
  });
});
