import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveProductForLine,
  type ProductResolverMaps,
} from "@/lib/product-resolver";
import type { Product } from "@/generated/prisma/client";

function sampleProduct(overrides: Partial<Product> = {}): Product {
  return {
    mlItemId: "MLB123",
    organizationId: "org_1",
    sku: "SKU-ATUAL",
    ncm: null,
    unitCostNf: 0 as unknown as Product["unitCostNf"],
    purchaseIcmsPercent: 0 as unknown as Product["purchaseIcmsPercent"],
    hasIcmsSt: false,
    purchaseCostWithSt: null,
    ipiPercent: 0 as unknown as Product["ipiPercent"],
    extraCosts: 0 as unknown as Product["extraCosts"],
    isMonophasic: false,
    saleIcmsPercent: 0 as unknown as Product["saleIcmsPercent"],
    isImported: false,
    pmaPrice: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  };
}

function maps(overrides: Partial<ProductResolverMaps> = {}): ProductResolverMaps {
  return {
    productByMlItemId: new Map(),
    ...overrides,
  };
}

describe("resolveProductForLine", () => {
  it("resolves via mlItemId direct lookup", () => {
    const product = sampleProduct({ mlItemId: "MLB123" });
    const resolution = resolveProductForLine(
      { itemId: "MLB123" },
      maps({ productByMlItemId: new Map([["MLB123", product]]) }),
    );

    assert.equal(resolution.product, product);
  });

  it("ignores sku drift entirely — resolution never looks at sku text", () => {
    // Este é exatamente o caso que motivou a migração: o SKU do anúncio
    // mudou, mas a identidade real (mlItemId) é a mesma.
    const product = sampleProduct({ mlItemId: "MLB123", sku: "SKU-NOVO-DIFERENTE" });
    const resolution = resolveProductForLine(
      { itemId: "MLB123" },
      maps({ productByMlItemId: new Map([["MLB123", product]]) }),
    );

    assert.equal(resolution.product?.mlItemId, "MLB123");
    assert.equal(resolution.product?.sku, "SKU-NOVO-DIFERENTE");
  });

  it("returns unresolved when no Product is registered for the mlItemId", () => {
    const resolution = resolveProductForLine({ itemId: "MLB000" }, maps());

    assert.equal(resolution.product, null);
  });

  it("returns unresolved when the line has no itemId", () => {
    const resolution = resolveProductForLine({ itemId: null }, maps());
    assert.equal(resolution.product, null);
  });
});
