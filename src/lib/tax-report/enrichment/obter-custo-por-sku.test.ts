import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { custoProdutoFromView } from "@/lib/tax-report/enrichment/custo-produto";
import type { ProductView } from "@/lib/product-data";

function sampleView(overrides: Partial<ProductView> = {}): ProductView {
  return {
    sku: "SKU-A",
    ncm: null,
    unitCostNf: 100,
    purchaseIcmsPercent: 0,
    hasIcmsSt: false,
    purchaseCostWithSt: null,
    ipiPercent: 0,
    extraCosts: 2,
    isMonophasic: false,
    saleIcmsPercent: 18,
    isImported: true,
    importContentPercent: 30,
    pricingCost: 95,
    taxPercent: 9.25,
    taxPercentGeneratedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("custoProdutoFromView", () => {
  it("maps product view fields to CustoProduto", () => {
    const custo = custoProdutoFromView(sampleView());

    assert.equal(custo.sku, "SKU-A");
    assert.equal(custo.pricingCost, 95);
    assert.equal(custo.unitCostNf, 100);
    assert.equal(custo.purchaseIcmsPercent, 0);
    assert.equal(custo.hasIcmsSt, false);
    assert.equal(custo.saleIcmsPercent, 18);
    assert.equal(custo.extraCosts, 2);
    assert.equal(custo.isMonophasic, false);
    assert.equal(custo.isImported, true);
    assert.equal(custo.importContentPercent, 30);
  });

  it("handles null pricing cost", () => {
    const custo = custoProdutoFromView(sampleView({ pricingCost: null }));
    assert.equal(custo.pricingCost, null);
    assert.equal(custo.unitCostNf, 100);
  });

  it("maps zero unitCostNf to null", () => {
    const custo = custoProdutoFromView(sampleView({ unitCostNf: 0 }));
    assert.equal(custo.unitCostNf, null);
  });
});
