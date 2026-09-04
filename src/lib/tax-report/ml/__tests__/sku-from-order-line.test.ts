import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { skuFromOrderLine } from "@/lib/tax-report/ml/sku-from-order-line";

describe("skuFromOrderLine", () => {
  it("prefers item.seller_sku", () => {
    assert.equal(
      skuFromOrderLine({
        item: { seller_sku: "ABC", seller_custom_field: "X" },
      }),
      "ABC",
    );
  });

  it("falls back to seller_custom_field", () => {
    assert.equal(
      skuFromOrderLine({
        seller_custom_field: "FALLBACK",
      }),
      "FALLBACK",
    );
  });

  it("normalizes double internal spaces from ML sku", () => {
    assert.equal(
      skuFromOrderLine({
        item: { seller_sku: "MXT  - Cabo Guitar 10m (Próprio)" },
      }),
      "MXT - Cabo Guitar 10m (Próprio)",
    );
  });
});
