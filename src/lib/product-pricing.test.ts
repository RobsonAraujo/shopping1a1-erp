import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeEffectivePricingCost,
  computePricingTaxPercent,
  resolveProductPricing,
} from "@/lib/product-pricing";

describe("product-pricing", () => {
  it("computes effective cost from spreadsheet example (104,47 → 104,35)", () => {
    const cost = computeEffectivePricingCost({
      unitCostNf: 104.47,
      purchaseIcmsPercent: 18,
      hasIcmsSt: true,
      purchaseCostWithSt: 112.27,
      ipiPercent: 0,
      isMonophasic: false,
      pisCofinsPercent: 9.25,
    });
    assert.equal(cost, 104.35);
  });

  it("computes pricing tax percent (3% + 9,25%)", () => {
    const tax = computePricingTaxPercent({
      saleIcmsPercent: 3,
      isMonophasic: false,
      pisCofinsPercent: 9.25,
    });
    assert.equal(tax, 12.25);
  });

  it("monophasic excludes PIS/COFINS from sale tax", () => {
    const tax = computePricingTaxPercent({
      saleIcmsPercent: 3,
      isMonophasic: true,
      pisCofinsPercent: 9.25,
    });
    assert.equal(tax, 3);
  });

  it("without ICMS-ST uses NF + IPI and ICMS credit", () => {
    const cost = computeEffectivePricingCost({
      unitCostNf: 100,
      purchaseIcmsPercent: 18,
      hasIcmsSt: false,
      purchaseCostWithSt: null,
      ipiPercent: 5,
      isMonophasic: false,
      pisCofinsPercent: 9.25,
    });
    // base 105, -18 ICMS, - (100-18)*0.0925 = 7.585
    assert.equal(cost, 79.42);
  });

  it("monophasic excludes PIS/COFINS purchase credit", () => {
    const cost = computeEffectivePricingCost({
      unitCostNf: 104.47,
      purchaseIcmsPercent: 18,
      hasIcmsSt: true,
      purchaseCostWithSt: 112.27,
      ipiPercent: 0,
      isMonophasic: true,
      pisCofinsPercent: 9.25,
    });
    assert.equal(cost, 112.27);
  });

  it("resolveProductPricing returns full bundle", () => {
    const resolved = resolveProductPricing(
      {
        unitCostNf: 104.47,
        purchaseIcmsPercent: 18,
        hasIcmsSt: true,
        purchaseCostWithSt: 112.27,
        ipiPercent: 0,
        extraCosts: 0.5,
        isMonophasic: false,
        saleIcmsPercent: 3,
      },
      9.25,
    );
    assert.ok(resolved);
    assert.equal(resolved!.pricingCost, 104.35);
    assert.equal(resolved!.taxPercent, 12.25);
    assert.equal(resolved!.extraCosts, 0.5);
  });
});
