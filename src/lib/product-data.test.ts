import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  productWriteToPrismaData,
  validateProductInput,
  type ProductWriteInput,
} from "@/lib/product-data";

function baseInput(overrides: Partial<ProductWriteInput> = {}): ProductWriteInput {
  return {
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
    const data = productWriteToPrismaData(baseInput({ pmaPrice: 120 }));
    assert.equal(data.pmaPrice, 120);
  });

  it("defaults pmaPrice to null when absent", () => {
    const data = productWriteToPrismaData(baseInput());
    assert.equal(data.pmaPrice, null);
  });
});
