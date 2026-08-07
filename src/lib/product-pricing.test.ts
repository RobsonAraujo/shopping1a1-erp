import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeEffectivePricingCost,
  computePricingTaxPercent,
  normalizeProductSku,
  purchaseIcmsCreditUnit,
  purchasePisCofinsCreditBaseUnit,
  resolveProductPricing,
} from "@/lib/product-pricing";

describe("product-pricing", () => {
  it("with ICMS-ST uses purchaseCostWithSt + IPI", () => {
    const cost = computeEffectivePricingCost({
      unitCostNf: 104.47,
      purchaseIcmsPercent: 18,
      hasIcmsSt: true,
      purchaseCostWithSt: 112.27,
      ipiPercent: 0,
      isMonophasic: false,
      pisCofinsPercent: 9.25,
    });
    assert.equal(cost, 112.27);
  });

  it("computes pricing cost example from user (11,90 + IPI 5% = 12,49)", () => {
    const cost = computeEffectivePricingCost({
      unitCostNf: 11.9,
      purchaseIcmsPercent: 18,
      hasIcmsSt: false,
      purchaseCostWithSt: null,
      ipiPercent: 5,
      isMonophasic: false,
      pisCofinsPercent: 9.25,
    });
    assert.equal(cost, 12.5);
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

  it("without ICMS-ST uses unitCostNf + IPI (no credit discounts)", () => {
    const cost = computeEffectivePricingCost({
      unitCostNf: 100,
      purchaseIcmsPercent: 18,
      hasIcmsSt: false,
      purchaseCostWithSt: null,
      ipiPercent: 5,
      isMonophasic: false,
      pisCofinsPercent: 9.25,
    });
    assert.equal(cost, 105);
  });

  it("ignores isMonophasic/pisCofinsPercent for pricing cost", () => {
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
    assert.equal(resolved!.pricingCost, 112.27);
    assert.equal(resolved!.taxPercent, 12.25);
    assert.equal(resolved!.extraCosts, 0.5);
  });
});

describe("purchaseIcmsCreditUnit", () => {
  it("without ST: normal credit regardless of interna/interestadual", () => {
    const credit = purchaseIcmsCreditUnit({
      unitCostNf: 100,
      purchaseIcmsPercent: 18,
      hasIcmsSt: false,
      isOperacaoInterna: true,
      considerarStRecuperavel: false,
    });
    assert.equal(credit, 18);
  });

  it("ST + venda interna: crédito zerado", () => {
    const credit = purchaseIcmsCreditUnit({
      unitCostNf: 100,
      purchaseIcmsPercent: 18,
      hasIcmsSt: true,
      isOperacaoInterna: true,
      considerarStRecuperavel: true,
    });
    assert.equal(credit, 0);
  });

  it("ST + interestadual + recuperável desligado: crédito de entrada normal (não depende do switch)", () => {
    const credit = purchaseIcmsCreditUnit({
      unitCostNf: 100,
      purchaseIcmsPercent: 18,
      hasIcmsSt: true,
      isOperacaoInterna: false,
      considerarStRecuperavel: false,
    });
    assert.equal(credit, 18);
  });

  it("ST + interestadual + recuperável ligado: crédito normal (por simetria)", () => {
    const credit = purchaseIcmsCreditUnit({
      unitCostNf: 100,
      purchaseIcmsPercent: 18,
      hasIcmsSt: true,
      isOperacaoInterna: false,
      considerarStRecuperavel: true,
    });
    assert.equal(credit, 18);
  });
});

describe("purchasePisCofinsCreditBaseUnit", () => {
  it("ST + venda interna: usa Custo Unitário (não o custo com ST)", () => {
    const base = purchasePisCofinsCreditBaseUnit({ unitCostNf: 100 });
    assert.equal(base, 100);
  });

  it("ST + interestadual: usa Custo Unitário", () => {
    const base = purchasePisCofinsCreditBaseUnit({ unitCostNf: 100 });
    assert.equal(base, 100);
  });

  it("sem ST: usa Custo Unitário", () => {
    const base = purchasePisCofinsCreditBaseUnit({ unitCostNf: 100 });
    assert.equal(base, 100);
  });
});

describe("normalizeProductSku", () => {
  it("trims leading and trailing spaces", () => {
    assert.equal(normalizeProductSku("  SKU-A  "), "SKU-A");
  });

  it("collapses internal multiple spaces", () => {
    assert.equal(
      normalizeProductSku("MXT  - Cabo Guitar 10m (Próprio)"),
      "MXT - Cabo Guitar 10m (Próprio)",
    );
  });

  it("normalizes tabs and newlines to single spaces", () => {
    assert.equal(normalizeProductSku("MXT\t-\tCabo"), "MXT - Cabo");
    assert.equal(normalizeProductSku("MXT\n- Cabo"), "MXT - Cabo");
  });

  it("converts NBSP to regular space", () => {
    assert.equal(normalizeProductSku("MXT\u00A0- Cabo"), "MXT - Cabo");
  });
});
