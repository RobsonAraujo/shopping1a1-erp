import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFinancialMargin, roundMoney } from "./financial-margin";

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
