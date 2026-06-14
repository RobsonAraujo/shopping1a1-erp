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

  it("applies ML fee rebate as separate credit line", () => {
    const result = computeFinancialMargin({
      salePrice: 26,
      mlFeeAmount: 3.38,
      mlFeeRebate: 1.56,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0,
      taxRatePercent: 0,
      listingTypeLabel: "Clássico",
    });

    const rebateLine = result.lines.find((line) => line.key === "mlFeeRebate");
    assert.ok(rebateLine);
    assert.equal(rebateLine?.value, -1.56);
    assert.equal(result.totalCosts, roundMoney(3.38 + 6.65 + 11.97 - 1.56));
    assert.equal(result.marginValue, roundMoney(26 - result.totalCosts));
  });

  it("caps fee rebate at gross ML fee amount", () => {
    const result = computeFinancialMargin({
      salePrice: 26,
      mlFeeAmount: 1,
      mlFeeRebate: 5,
      shippingCost: 0,
      productCost: 0,
      extraCosts: 0,
      taxRatePercent: 0,
    });

    const rebateLine = result.lines.find((line) => line.key === "mlFeeRebate");
    assert.equal(rebateLine?.value, -1);
    assert.equal(result.totalCosts, 0);
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
