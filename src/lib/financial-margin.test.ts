import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFinancialMargin,
  computeMarginAfterAds,
  roundMoney,
} from "./financial-margin";

describe("computeFinancialMargin", () => {
  it("calculates Cabo 10m example margins", () => {
    const result = computeFinancialMargin({
      salePrice: 33.17,
      mlFeeAmount: 4.31,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0.3,
      taxRatePercent: 12.25,
      listingTypeLabel: "Clássico",
    });

    assert.equal(result.salePrice, 33.17);
    assert.equal(result.totalCosts, 27.29);
    assert.equal(result.marginValue, 5.88);
    assert.equal(result.marginPercent, 17.73);
    assert.equal(result.isComplete, true);

    const taxLine = result.lines.find((line) => line.key === "tax");
    assert.equal(taxLine?.value, 4.06);
  });

  it("flags incomplete when product cost is missing", () => {
    const result = computeFinancialMargin({
      salePrice: 100,
      mlFeeAmount: 10,
      shippingCost: 5,
      productCost: null,
      extraCosts: 0,
      taxRatePercent: 10,
    });

    assert.equal(result.isComplete, false);
    assert.ok(result.missingFields.includes("productCost"));
    assert.equal(result.marginValue, roundMoney(100 - (10 + 5 + 0 + 10)));
  });
});

describe("computeMarginAfterAds", () => {
  it("subtracts TACOS from margin percent for table display", () => {
    const margin = computeFinancialMargin({
      salePrice: 100,
      mlFeeAmount: 10,
      shippingCost: 5,
      productCost: 50,
      extraCosts: 0,
      taxRatePercent: 0,
    });

    const afterAds = computeMarginAfterAds({
      marginBreakdown: margin,
      tacosPercent: 7,
      adsCost: 7,
      unitsSold: 1,
    });

    assert.ok(afterAds);
    assert.equal(afterAds.marginAfterAdsPercent, 28);
    assert.equal(afterAds.marginAfterAdsValue, 28);
  });

  it("returns zero ads deduction when TACOS is zero", () => {
    const margin = computeFinancialMargin({
      salePrice: 33.17,
      mlFeeAmount: 4.31,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0.3,
      taxRatePercent: 12.25,
    });

    const afterAds = computeMarginAfterAds({
      marginBreakdown: margin,
      tacosPercent: 0,
      adsCost: 0,
      unitsSold: 0,
    });

    assert.ok(afterAds);
    assert.equal(afterAds.marginAfterAdsPercent, margin.marginPercent);
    assert.equal(afterAds.marginAfterAdsValue, margin.marginValue);
  });
});
