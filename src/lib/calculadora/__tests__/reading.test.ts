import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  adsSpendWithoutSales,
  marginNow,
  type CalculatorAds,
  type CalculatorReading,
} from "@/lib/calculadora/reading";

function ads(overrides: Partial<CalculatorAds> = {}): CalculatorAds {
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

function reading(overrides: Partial<CalculatorReading> = {}): CalculatorReading {
  return {
    mlItemId: "MLB1",
    readAt: "2026-11-18T17:32:00.000Z",
    listingTypeId: "gold_special",
    price: 100,
    regularPrice: null,
    hasPromotion: false,
    promotionKnown: true,
    pmaPrice: null,
    costsNow: { mlFeeAmount: 12, shippingCost: 0 },
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
    taxSource: { regime: "report", window: { from: "2026-10-19", to: "2026-11-17" } },
    blocked: null,
    catalog: null,
    targetPercent: 8,
    ownTarget: false,
    ads: ads(),
    purchaseBasis: { kind: "nf", unitCostNf: 50, ipiPercent: 0, stFactor: null, units: 1 },
    ...overrides,
  };
}

describe("marginNow", () => {
  it("uses the TACOS of the chosen basis on today's quoted costs", () => {
    const today = marginNow(reading(), ads({ tacosPercent: 4 }), 8);
    assert.equal(today.marginPercent, 28);
    assert.equal(today.marginAfterAdsPercent, 24);
    assert.equal(today.decidingBasis, "afterAds");

    const week = marginNow(reading(), ads({ basis: "7d", tacosPercent: 22 }), 8);
    assert.equal(week.marginPercent, 28);
    assert.equal(week.marginAfterAdsPercent, 6);
    assert.equal(week.meetsTarget, false);
  });

  it("decides by MC when today's ADS spent without selling", () => {
    const spent = ads({ tacosPercent: null, adsCost: 4.2, adsUnitsSold: 0 });
    assert.equal(adsSpendWithoutSales(spent), true);
    const result = marginNow(reading(), spent, 8);
    assert.equal(result.decidingBasis, "contribution");
    assert.equal(result.marginAfterAdsPercent, null);
    assert.equal(adsSpendWithoutSales(ads({ tacosPercent: 0, adsCost: 0 })), false);
  });

  it("has no margin when the ML did not quote today's price", () => {
    const result = marginNow(reading({ costsNow: null }), ads(), 8);
    assert.equal(result.quoted, false);
    assert.equal(result.marginPercent, null);
  });
});
