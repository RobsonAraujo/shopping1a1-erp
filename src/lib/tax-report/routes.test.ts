import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTaxReportSkuParams } from "@/lib/tax-report/routes";

describe("parseTaxReportSkuParams", () => {
  it("normalizes sku from URL with double internal spaces", () => {
    const parsed = parseTaxReportSkuParams({
      year: "2026",
      month: "6",
      sku: encodeURIComponent("MXT  - Cabo Guitar 10m (Próprio)"),
    });
    assert.ok(parsed);
    assert.equal(parsed!.sku, "MXT - Cabo Guitar 10m (Próprio)");
  });

  it("trims surrounding spaces from decoded sku", () => {
    const parsed = parseTaxReportSkuParams({
      year: "2026",
      month: "6",
      sku: encodeURIComponent("  SKU-A  "),
    });
    assert.ok(parsed);
    assert.equal(parsed!.sku, "SKU-A");
  });
});
