import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFloorsWithQuotes, type FloorSeed } from "@/lib/rotina/floors";
import type { RotinaPricingInputs } from "@/lib/rotina/types";

function inputs(overrides: Partial<RotinaPricingInputs> = {}): RotinaPricingInputs {
  return {
    productCost: 40,
    extraCosts: 0,
    taxRatePercent: 10,
    mlFeeRebate: 0,
    listingTypeId: "gold_special",
    listingTypeLabel: "Clássico",
    adsMetricsAvailable: false,
    tacosPercent: null,
    adsCost: null,
    adsUnitsSold: null,
    ...overrides,
  };
}

/**
 * A busca fecha em centavos e com passo próprio: o mínimo fica logo acima do
 * valor exato da fórmula (taxa e imposto arredondados podem tirar a meta nele).
 */
function near(actual: number | null, exact: number, label: string) {
  assert.ok(
    actual !== null && actual >= exact - 0.01 && actual <= exact + 0.1,
    `${label}: ${actual} (esperado ~${exact})`,
  );
}

/** Taxa = % do preço; frete zero (um segmento só). */
function quotesAt(feeRate: number) {
  let calls = 0;
  return {
    quote: async (price: number) => {
      calls += 1;
      return { mlFeeAmount: Math.round(price * feeRate * 100) / 100, shippingCost: 0 };
    },
    shippingAt: async () => 0,
    calls: () => calls,
  };
}

function seed(feeRate: number, overrides: Partial<RotinaPricingInputs> = {}): FloorSeed {
  const salePrice = 100;
  const fee = salePrice * feeRate;
  // MC de hoje: 100 − taxa − 40 − 10.
  const margin = salePrice - fee - 40 - 10;
  return {
    salePrice,
    mlFeeAmount: fee,
    shippingCost: 0,
    inputs: inputs(overrides),
    currentContributionMarginPercent: margin,
    currentAfterAdsMarginPercent: null,
  };
}

describe("computeFloorsWithQuotes (mínimo no outro tipo)", () => {
  it("raises the minimum when the listing type charges a higher fee", async () => {
    // Meta 10%: Clássico 12% → 40 / (1 − 0,12 − 0,10 − 0,10) ≈ 58,82;
    // Premium 17% → 40 / 0,63 ≈ 63,49.
    const classic = await computeFloorsWithQuotes(seed(0.12), 10, quotesAt(0.12));
    const premium = await computeFloorsWithQuotes(
      seed(0.17, { listingTypeId: "gold_pro", listingTypeLabel: "Premium" }),
      10,
      quotesAt(0.17),
    );
    assert.equal(classic.reason, "ok");
    assert.equal(premium.reason, "ok");
    near(classic.mcPrice, 58.82, "Clássico");
    near(premium.mcPrice, 63.49, "Premium");
    assert.ok((premium.mcPrice ?? 0) > (classic.mcPrice ?? 0));
    // Sem ADS utilizável não há mínimo após ADS.
    assert.equal(premium.afterAdsPrice, null);
  });

  it("uses MC + TACOS for the after-ADS minimum", async () => {
    // TACOS 5%: Premium → 40 / (1 − 0,17 − 0,10 − 0,10 − 0,05) ≈ 68,97.
    const premium = await computeFloorsWithQuotes(
      seed(0.17, { adsMetricsAvailable: true, tacosPercent: 5, adsCost: 50, adsUnitsSold: 10 }),
      10,
      quotesAt(0.17),
    );
    near(premium.afterAdsPrice, 68.97, "Premium após ADS");
  });

  it("does not invent a minimum without product cost", async () => {
    const result = await computeFloorsWithQuotes(
      seed(0.17, { productCost: null }),
      10,
      quotesAt(0.17),
    );
    assert.equal(result.reason, "missing_product_cost");
    assert.equal(result.mcPrice, null);
  });
});
