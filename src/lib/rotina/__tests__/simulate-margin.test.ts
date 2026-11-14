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
    listingTypeId: "gold_pro",
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

  it("labels the fee by the simulated listing type and keeps the same fee rebate", () => {
    // Mesmo preço, só a taxa muda: Clássico 12% × Premium 17%. O rebate (R$ 3)
    // da última venda vale nos dois tipos.
    const classic = simulateMarginAtPrice(
      100,
      { mlFeeAmount: 12, shippingCost: 20 },
      inputs({ listingTypeId: "gold_special", listingTypeLabel: "Clássico", mlFeeRebate: 3 }),
      2,
    );
    const premium = simulateMarginAtPrice(
      100,
      { mlFeeAmount: 17, shippingCost: 20 },
      inputs({ listingTypeId: "gold_pro", listingTypeLabel: "Premium", mlFeeRebate: 3 }),
      2,
    );
    assert.equal(classic.listingTypeId, "gold_special");
    assert.equal(premium.listingTypeId, "gold_pro");
    assert.equal(classic.lines.find((line) => line.key === "mlFee")?.label, "Taxa Clássico");
    assert.equal(premium.lines.find((line) => line.key === "mlFee")?.label, "Taxa Premium");
    assert.equal(classic.lines.find((line) => line.key === "mlFeeRebate")?.value, -3);
    assert.equal(premium.lines.find((line) => line.key === "mlFeeRebate")?.value, -3);
    // 100 − 12 + 3 − 20 − 40 − 10 = 21 → 21%; Premium: 100 − 17 + 3 − 20 − 40 − 10 = 16.
    assert.equal(classic.marginPercent, 21);
    assert.equal(premium.marginPercent, 16);
  });

  it("caps the fee rebate at the fee of the simulated type", () => {
    const result = simulateMarginAtPrice(
      100,
      { mlFeeAmount: 2, shippingCost: 0 },
      inputs({ mlFeeRebate: 5 }),
      2,
    );
    assert.equal(result.lines.find((line) => line.key === "mlFeeRebate")?.value, -2);
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
