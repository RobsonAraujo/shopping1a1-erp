import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diffLevelableProductFields,
  indexProductPricingLookup,
  productWriteToPrismaData,
  validateProductInput,
  type ProductWriteInput,
} from "@/lib/product-data";
import type { Product } from "@/generated/prisma/client";

function baseInput(overrides: Partial<ProductWriteInput> = {}): ProductWriteInput {
  return {
    mlItemId: "MLB1",
    sku: "SKU-A",
    unitCostNf: 50,
    purchaseIcmsPercent: 18,
    hasIcmsSt: false,
    ipiPercent: 0,
    extraCosts: 0,
    isMonophasic: false,
    isImported: false,
    saleIcmsPercent: 18,
    ...overrides,
  };
}

describe("validateProductInput — pmaPrice", () => {
  it("accepts a missing pmaPrice", () => {
    assert.equal(validateProductInput(baseInput()), null);
  });

  it("accepts a positive pmaPrice", () => {
    assert.equal(validateProductInput(baseInput({ pmaPrice: 120 })), null);
  });

  it("rejects a zero or negative pmaPrice", () => {
    assert.notEqual(validateProductInput(baseInput({ pmaPrice: 0 })), null);
    assert.notEqual(validateProductInput(baseInput({ pmaPrice: -10 })), null);
  });
});

describe("productWriteToPrismaData — pmaPrice", () => {
  it("maps pmaPrice through when present", () => {
    const data = productWriteToPrismaData("org-1", baseInput({ pmaPrice: 120 }));
    assert.equal(data.pmaPrice, 120);
  });

  it("defaults pmaPrice to null when absent", () => {
    const data = productWriteToPrismaData("org-1", baseInput());
    assert.equal(data.pmaPrice, null);
  });
});

function baseProduct(overrides: Partial<Record<string, unknown>> = {}): Product {
  return {
    mlItemId: "MLB1",
    organizationId: "org-1",
    sku: "SKU-A",
    ncm: null,
    unitCostNf: 50,
    purchaseIcmsPercent: 18,
    hasIcmsSt: false,
    purchaseCostWithSt: null,
    ipiPercent: 0,
    extraCosts: 0,
    isMonophasic: false,
    saleIcmsPercent: 18,
    isImported: false,
    pmaPrice: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as unknown as Product;
}

describe("diffLevelableProductFields", () => {
  it("reports no changed fields when nothing changed", () => {
    const before = baseProduct();
    const { changedFields } = diffLevelableProductFields(before, baseInput());
    assert.deepEqual(changedFields, []);
  });

  it("detects a single changed field (unitCostNf)", () => {
    const before = baseProduct({ unitCostNf: 50 });
    const { changedFields, previousValues } = diffLevelableProductFields(
      before,
      baseInput({ unitCostNf: 65 }),
    );
    assert.deepEqual(changedFields, ["unitCostNf"]);
    // previousValues traz o snapshot completo de antes, não só o campo mudado.
    assert.equal(previousValues.unitCostNf, 50);
    assert.equal(previousValues.purchaseIcmsPercent, 18);
  });

  it("marks both hasIcmsSt and purchaseCostWithSt when toggled true→false", () => {
    const before = baseProduct({ hasIcmsSt: true, purchaseCostWithSt: 70 });
    const { changedFields, previousValues } = diffLevelableProductFields(
      before,
      baseInput({ hasIcmsSt: false, purchaseCostWithSt: null }),
    );
    assert.ok(changedFields.includes("hasIcmsSt"));
    assert.ok(changedFields.includes("purchaseCostWithSt"));
    assert.equal(previousValues.hasIcmsSt, true);
    assert.equal(previousValues.purchaseCostWithSt, 70);
  });

  it("ignores fields omitted from the payload (Simples Nacional hides Lucro Real fields)", () => {
    const before = baseProduct({
      purchaseIcmsPercent: 18,
      saleIcmsPercent: 18,
      isMonophasic: true,
      isImported: true,
    });
    const simplesInput: ProductWriteInput = {
      mlItemId: "MLB1",
      sku: "SKU-A",
      unitCostNf: 50,
      extraCosts: 0,
      // Campos fiscais de Lucro Real omitidos (regime Simples Nacional).
    };
    const { changedFields } = diffLevelableProductFields(before, simplesInput);
    assert.deepEqual(changedFields, []);
  });
});

describe("indexProductPricingLookup", () => {
  it("indexes each product by mlItemId (always 1:1)", () => {
    const products = [
      baseProduct({ mlItemId: "MLB1", sku: "SKU-A", unitCostNf: 50 }),
      baseProduct({ mlItemId: "MLB2", sku: "SKU-B", unitCostNf: 80 }),
    ];
    const { byMlItemId } = indexProductPricingLookup(products, 0);
    assert.equal(byMlItemId.get("MLB1")?.pricingCost, 50);
    assert.equal(byMlItemId.get("MLB2")?.pricingCost, 80);
  });

  it("does not merge two products that share the same display sku text (Product.sku is not unique)", () => {
    const products = [
      baseProduct({ mlItemId: "MLB1", sku: "SKU-COLIDIU", unitCostNf: 50 }),
      baseProduct({ mlItemId: "MLB2", sku: "SKU-COLIDIU", unitCostNf: 80 }),
    ];
    const { byMlItemId, bySku } = indexProductPricingLookup(products, 0);

    assert.equal(byMlItemId.get("MLB1")?.pricingCost, 50);
    assert.equal(byMlItemId.get("MLB2")?.pricingCost, 80);
    // bySku é só fallback — colisão de texto resolve "primeiro que chega
    // vence" (não-determinístico na prática, ordem do Postgres); o que
    // importa é que byMlItemId nunca perde/mistura dado dos dois produtos.
    assert.equal(bySku.size, 1);
    assert.ok([50, 80].includes(bySku.get("SKU-COLIDIU")?.pricingCost ?? -1));
  });

  it("skips a product without a registrable pricing (ICMS-ST marked but no purchaseCostWithSt registered)", () => {
    const products = [
      baseProduct({
        mlItemId: "MLB1",
        sku: "SKU-A",
        hasIcmsSt: true,
        purchaseCostWithSt: null,
      }),
    ];
    const { byMlItemId, bySku } = indexProductPricingLookup(products, 0);
    assert.equal(byMlItemId.size, 0);
    assert.equal(bySku.size, 0);
  });
});
