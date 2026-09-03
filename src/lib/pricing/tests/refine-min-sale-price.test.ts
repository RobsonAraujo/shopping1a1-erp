import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  marginPercentAtPrice,
  type MlCostsAtPrice,
} from "@/lib/pricing/refine-min-sale-price";
import {
  computeFinancialMargin,
  roundMoney,
} from "@/lib/pricing/financial-margin";

describe("marginPercentAtPrice", () => {
  it("matches contribution margin from computeFinancialMargin", () => {
    const expected = computeFinancialMargin({
      salePrice: 26,
      mlFeeAmount: 3.38,
      mlFeeRebate: 1.56,
      shippingCost: 6.65,
      productCost: 11.97,
      extraCosts: 0,
      taxRatePercent: 0,
    });

    const margin = marginPercentAtPrice(
      26,
      3.38,
      6.65,
      {
        mlFeeRebate: 1.56,
        productCost: 11.97,
        extraCosts: 0,
        taxRatePercent: 0,
        listingTypeLabel: "Clássico",
        marginBasis: "contribution",
        tacosPercent: null,
        adsCost: null,
        adsUnitsSold: null,
        adsMetricsAvailable: false,
      },
    );

    assert.equal(margin, expected.marginPercent);
  });

  it("uses TACOS for afterAds basis", () => {
    const contribution = marginPercentAtPrice(
      47.36,
      4.31,
      6.65,
      {
        mlFeeRebate: 0,
        productCost: 11.97,
        extraCosts: 0.3,
        taxRatePercent: 12.25,
        listingTypeLabel: "Clássico",
        marginBasis: "contribution",
        tacosPercent: 5.68,
        adsCost: 100,
        adsUnitsSold: 10,
        adsMetricsAvailable: true,
      },
    );

    const afterAds = marginPercentAtPrice(
      47.36,
      4.31,
      6.65,
      {
        mlFeeRebate: 0,
        productCost: 11.97,
        extraCosts: 0.3,
        taxRatePercent: 12.25,
        listingTypeLabel: "Clássico",
        marginBasis: "afterAds",
        tacosPercent: 5.68,
        adsCost: 100,
        adsUnitsSold: 10,
        adsMetricsAvailable: true,
      },
    );

    assert.ok(contribution !== null);
    assert.ok(afterAds !== null);
    assert.equal(afterAds, roundMoney(contribution! - 5.68));
  });
});

describe("binary search min price (mock flat costs)", () => {
  it("finds lowest price that meets target margin when ML costs are constant", () => {
    const flatCosts: MlCostsAtPrice = {
      mlFeeAmount: 3.38,
      shippingCost: 6.65,
    };
    const target = 6;

    let low = roundMoney(Math.max(0.01, 11.97));
    let high = 26;

    for (let i = 0; i < 8; i++) {
      if (high - low <= 0.01) break;
      const mid = roundMoney((low + high) / 2);
      const marginMid = marginPercentAtPrice(mid, flatCosts.mlFeeAmount, flatCosts.shippingCost, {
        mlFeeRebate: 1.56,
        productCost: 11.97,
        extraCosts: 0,
        taxRatePercent: 0,
        listingTypeLabel: null,
        marginBasis: "contribution",
        tacosPercent: null,
        adsCost: null,
        adsUnitsSold: null,
        adsMetricsAvailable: false,
      });
      assert.ok(marginMid !== null);
      if (marginMid! >= target) high = mid;
      else low = mid;
    }

    const marginAtMin = marginPercentAtPrice(high, flatCosts.mlFeeAmount, flatCosts.shippingCost, {
      mlFeeRebate: 1.56,
      productCost: 11.97,
      extraCosts: 0,
      taxRatePercent: 0,
      listingTypeLabel: null,
      marginBasis: "contribution",
      tacosPercent: null,
      adsCost: null,
      adsUnitsSold: null,
      adsMetricsAvailable: false,
    });

    assert.ok(marginAtMin !== null);
    assert.ok(marginAtMin! >= target);
    assert.ok(high <= 26);
  });
});
