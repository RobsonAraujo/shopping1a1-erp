import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeTargetMarginFromReduction,
  computeTargetMarginValueFromReduction,
  computeWholesalePricesForListing,
  computeWholesaleSalePrice,
  displayMinPurchaseUnitForLevel,
  mlDiscountMinPurchaseUnitForLevel,
  validateWholesaleReductionSettings,
} from "../wholesale-pricing";

describe("computeTargetMarginFromReduction", () => {
  it("reduces current margin by the configured percent", () => {
    assert.equal(computeTargetMarginFromReduction(10.77, 10), 9.69);
    assert.equal(computeTargetMarginFromReduction(-1, 10), -0.9);
  });
});

describe("computeTargetMarginValueFromReduction", () => {
  it("reduces current margin value by the configured percent", () => {
    assert.equal(computeTargetMarginValueFromReduction(-0.4, 10), -0.36);
    assert.equal(computeTargetMarginValueFromReduction(10.77, 10), 9.69);
  });
});

describe("computeWholesaleSalePrice", () => {
  it("adds reduced margin value to fixed retail costs", () => {
    const result = computeWholesaleSalePrice({
      mlFeeAmount: 13,
      shippingCost: 20,
      productCost: 40,
      extraCosts: 2,
      targetMarginValue: 9.69,
    });

    assert.equal(result.reason, "ok");
    // 13 + 20 + 40 + 2 + 9.69 = 84.69
    assert.equal(result.suggestedPrice, 84.69);
  });
});

describe("wholesale min purchase units", () => {
  it("treats level 1 as anchor at 1 unit for ML", () => {
    const settings = {
      level1ReductionPercent: 10,
      level2ReductionPercent: 15,
      level3ReductionPercent: 20,
      level1MinPurchaseUnit: 1,
      level2MinPurchaseUnit: 5,
      level3MinPurchaseUnit: 10,
    };

    assert.equal(
      validateWholesaleReductionSettings(settings),
      null,
    );
    assert.equal(displayMinPurchaseUnitForLevel(1, settings), 1);
    assert.equal(displayMinPurchaseUnitForLevel(2, settings), 5);
    assert.equal(mlDiscountMinPurchaseUnitForLevel(1, settings), 1);
    assert.equal(mlDiscountMinPurchaseUnitForLevel(2, settings), 5);
    assert.equal(mlDiscountMinPurchaseUnitForLevel(3, settings), 10);
  });

  it("rejects level 1 min other than 1", () => {
    const err = validateWholesaleReductionSettings({
      level1ReductionPercent: 10,
      level2ReductionPercent: 15,
      level3ReductionPercent: 20,
      level1MinPurchaseUnit: 2,
      level2MinPurchaseUnit: 5,
      level3MinPurchaseUnit: 10,
    });
    assert.match(err ?? "", /âncora/i);
  });
});

describe("computeWholesalePricesForListing", () => {
  it("computes wholesale price as fixed costs plus reduced margin value", () => {
    const results = computeWholesalePricesForListing({
      salePrice: 100,
      mlFeeAmount: 13,
      shippingCost: 20,
      productCost: 40,
      extraCosts: 2,
      currentMarginPercent: 10.77,
      currentMarginValue: 10.77,
      reductions: [10, 15, 20],
    });

    assert.equal(results[0].level, 1);
    assert.equal(results[0].reductionPercent, 10);
    assert.equal(results[0].targetMarginPercent, 9.69);
    assert.equal(results[0].targetMarginValue, 9.69);
    assert.equal(results[0].reason, "ok");
    assert.equal(results[0].suggestedPrice, 84.69);

    assert.equal(results[1].targetMarginPercent, 9.15);
    assert.equal(results[1].targetMarginValue, 9.15);
    assert.equal(results[1].suggestedPrice, 84.15);

    assert.equal(results[2].targetMarginPercent, 8.62);
    assert.equal(results[2].targetMarginValue, 8.62);
    assert.equal(results[2].suggestedPrice, 83.62);
  });

  it("handles negative margin like the Altec example", () => {
    const results = computeWholesalePricesForListing({
      salePrice: 40.1,
      mlFeeAmount: 5,
      shippingCost: 6.5,
      productCost: 28,
      extraCosts: 1,
      currentMarginPercent: -1,
      currentMarginValue: -0.4,
      reductions: [10, 15, 20],
    });

    assert.equal(results[0].targetMarginPercent, -0.9);
    assert.equal(results[0].targetMarginValue, -0.36);
    assert.equal(results[0].reason, "ok");
    // 5 + 6.5 + 28 + 1 + (-0.36) = 40.14
    assert.equal(results[0].suggestedPrice, 40.14);
  });

  it("returns missing_current_margin when margin is unknown", () => {
    const results = computeWholesalePricesForListing({
      salePrice: 100,
      mlFeeAmount: 13,
      shippingCost: 20,
      productCost: 40,
      extraCosts: 2,
      currentMarginPercent: null,
      currentMarginValue: null,
      reductions: [10, 15, 20],
    });

    assert.equal(results[0].reason, "missing_current_margin");
    assert.equal(results[0].suggestedPrice, null);
  });
});
