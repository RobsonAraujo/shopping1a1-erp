import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBrlInput } from "@/components/rotina/RotinaPriceSimulator";
import { simulateMarginAtPrice } from "@/lib/rotina/simulate-margin";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

function inputs(overrides: Partial<RotinaPricingInputs> = {}): RotinaPricingInputs {
  return {
    productCost: 40,
    extraCosts: 0,
    taxRatePercent: 10,
    mlFeeRebate: 0,
    listingTypeLabel: "Premium",
    adsMetricsAvailable: true,
    tacosPercent: 3,
    adsCost: 30,
    adsUnitsSold: 10,
    ...overrides,
  };
}

describe("simulateMarginAtPrice", () => {
  it("uses the same account as Lucratividade: MC and after ADS at the chosen price", () => {
    // 100 − 12 (taxa) − 20 (frete) − 40 (custo) − 10 (imposto) = 18 → 18%; TACOS 3% → 15%.
    const result = simulateMarginAtPrice(
      100,
      { mlFeeAmount: 12, shippingCost: 20 },
      inputs(),
      2,
    );
    assert.equal(result.quoted, true);
    assert.equal(result.marginPercent, 18);
    assert.equal(result.marginValue, 18);
    assert.equal(result.marginAfterAdsPercent, 15);
    assert.equal(result.marginAfterAdsValue, 15);
    assert.equal(result.decidingBasis, "afterAds");
    assert.equal(result.meetsTarget, true);
    assert.ok(result.lines.some((line) => line.key === "marginAfterAds"));
  });

  it("flags a price below the target", () => {
    // 60 − 7,2 − 0 − 40 − 6 = 6,8 → 11,33% MC; após ADS 8,33%. Meta 10% → abaixo.
    const result = simulateMarginAtPrice(60, { mlFeeAmount: 7.2, shippingCost: 0 }, inputs(), 10);
    assert.equal(result.marginAfterAdsPercent, 8.33);
    assert.equal(result.meetsTarget, false);
  });

  it("decides by MC when ADS spends without selling or is unavailable", () => {
    const spending = simulateMarginAtPrice(
      100,
      { mlFeeAmount: 12, shippingCost: 20 },
      inputs({ tacosPercent: null, adsCost: 50 }),
      2,
    );
    assert.equal(spending.decidingBasis, "contribution");
    assert.equal(spending.marginAfterAdsPercent, null);

    const unavailable = simulateMarginAtPrice(
      100,
      { mlFeeAmount: 12, shippingCost: 20 },
      inputs({ adsMetricsAvailable: false }),
      20,
    );
    assert.equal(unavailable.decidingBasis, "contribution");
    assert.equal(unavailable.meetsTarget, false);
  });

  it("returns an unquoted result when ML did not price it", () => {
    const result = simulateMarginAtPrice(100, null, inputs(), 2);
    assert.equal(result.quoted, false);
    assert.equal(result.meetsTarget, null);
    assert.deepEqual(result.lines, []);
  });
});

describe("parseBrlInput", () => {
  it("reads Brazilian money formats", () => {
    assert.equal(parseBrlInput("47,34"), 47.34);
    assert.equal(parseBrlInput("R$ 1.234,56"), 1234.56);
    assert.equal(parseBrlInput("47.9"), 47.9);
    assert.equal(parseBrlInput("  "), null);
    assert.equal(parseBrlInput("abc"), null);
    assert.equal(parseBrlInput("0"), null);
  });
});
