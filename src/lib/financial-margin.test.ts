import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeFinancialMargin,
  computeMarginAfterAds,
  computeMinSalePriceForTargetMargin,
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

  it("uses TACOS imputed on sale price when cost per ad unit differs", () => {
    const margin = computeFinancialMargin({
      salePrice: 47.36,
      mlFeeAmount: 5,
      shippingCost: 6,
      productCost: 20,
      extraCosts: 0,
      taxRatePercent: 0,
    });

    const afterAds = computeMarginAfterAds({
      marginBreakdown: margin,
      tacosPercent: 5.68,
      adsCost: 8.91,
      unitsSold: 3,
    });

    assert.ok(afterAds);
    assert.equal(afterAds.adsCostPerUnit, 2.97);
    assert.equal(afterAds.adsCostImputed, 2.69);
    const adsLine = afterAds.extendedLines.find((line) => line.key === "ads");
    assert.equal(adsLine?.value, 2.69);
    assert.equal(adsLine?.percentOfSale, 5.68);
    assert.equal(afterAds.marginAfterAdsPercent, roundMoney(margin.marginPercent! - 5.68));
    assert.equal(afterAds.marginAfterAdsValue, roundMoney(margin.marginValue - 2.69));
  });
});

describe("computeMinSalePriceForTargetMargin", () => {
  it("computes minimum price for 6% contribution margin (Cabo promo)", () => {
    const margin = computeFinancialMargin({
      salePrice: 26,
      mlFeeAmount: 3.38,
      mlFeeRebate: 1.56,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0,
      taxRatePercent: 0,
    });

    const result = computeMinSalePriceForTargetMargin({
      salePrice: 26,
      mlFeeAmount: 3.38,
      mlFeeRebate: 1.56,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0,
      taxRatePercent: 0,
      targetMarginPercent: 6,
      marginBasis: "contribution",
      currentContributionMarginPercent: margin.marginPercent,
    });

    assert.equal(result.reason, "ok");
    assert.equal(result.minSalePrice, 19.49);
    assert.equal(result.alreadyMeetsTarget, true);
  });

  it("includes TACOS when target is after ads", () => {
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

    const result = computeMinSalePriceForTargetMargin({
      salePrice: 100,
      mlFeeAmount: 10,
      shippingCost: 5,
      productCost: 50,
      extraCosts: 0,
      taxRatePercent: 0,
      targetMarginPercent: 28,
      marginBasis: "afterAds",
      tacosPercent: 7,
      currentAfterAdsMarginPercent: afterAds?.marginAfterAdsPercent ?? null,
    });

    assert.equal(result.reason, "ok");
    assert.equal(result.minSalePrice, 100);
    assert.equal(result.alreadyMeetsTarget, true);
  });

  it("returns impossible when denominator is non-positive", () => {
    const result = computeMinSalePriceForTargetMargin({
      salePrice: 26,
      mlFeeAmount: 3.38,
      mlFeeRebate: 1.56,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0,
      taxRatePercent: 0,
      targetMarginPercent: 80,
      marginBasis: "contribution",
      currentContributionMarginPercent: 10,
    });

    assert.equal(result.reason, "impossible");
    assert.equal(result.minSalePrice, null);
    assert.equal(result.alreadyMeetsTarget, false);
  });

  it("returns missing_product_cost when product cost is absent", () => {
    const result = computeMinSalePriceForTargetMargin({
      salePrice: 100,
      mlFeeAmount: 10,
      shippingCost: 5,
      productCost: null,
      extraCosts: 0,
      taxRatePercent: 0,
      targetMarginPercent: 6,
      marginBasis: "contribution",
    });

    assert.equal(result.reason, "missing_product_cost");
    assert.equal(result.minSalePrice, null);
  });

  it("flags when current price already meets target", () => {
    const margin = computeFinancialMargin({
      salePrice: 33.17,
      mlFeeAmount: 4.31,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0.3,
      taxRatePercent: 12.25,
    });

    const result = computeMinSalePriceForTargetMargin({
      salePrice: 33.17,
      mlFeeAmount: 4.31,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0.3,
      taxRatePercent: 12.25,
      targetMarginPercent: 6,
      marginBasis: "contribution",
      currentContributionMarginPercent: margin.marginPercent,
    });

    assert.equal(result.reason, "ok");
    assert.equal(result.alreadyMeetsTarget, true);
    assert.ok(result.minSalePrice !== null);
    assert.ok(result.minSalePrice! <= 33.17);
  });
});
