import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapToSlowMoverRows, buildSlowMoverRows } from "../slow-movers";
import type { PurchaseAnalysisItemRow } from "@/lib/purchase-analysis-rows";

function row(overrides: {
  id?: string;
  status?: string;
  coverageDays?: number | null;
  performanceTier?: "alta" | "media" | "baixa" | "zero";
}): PurchaseAnalysisItemRow {
  return {
    item: {
      id: overrides.id ?? "MLB1",
      title: "Item",
      status: overrides.status ?? "active",
      catalog_listing: false,
    },
    sku: "SKU-1",
    totalStock: 10,
    purchaseLeadTimeDays: 5,
    analysis: {
      coverageDays: overrides.coverageDays ?? null,
      dailyAvg: 1,
      unitsSoldInWindow: 5,
      performanceTier: overrides.performanceTier ?? "zero",
    },
  } as unknown as PurchaseAnalysisItemRow;
}

describe("mapToSlowMoverRows", () => {
  it("only includes active listings", () => {
    const rows = [row({ status: "active" }), row({ status: "paused" })];
    assert.equal(mapToSlowMoverRows(rows).length, 1);
  });

  it("maps title/sku/mlItemId fields through", () => {
    const [mapped] = mapToSlowMoverRows([row({ id: "MLB42" })]);
    assert.equal(mapped.mlItemId, "MLB42");
    assert.equal(mapped.sku, "SKU-1");
  });
});

describe("buildSlowMoverRows", () => {
  it("includes rows with zero performance tier regardless of coverage", () => {
    const rows = [row({ performanceTier: "zero", coverageDays: null })];
    assert.equal(buildSlowMoverRows(rows, 30).length, 1);
  });

  it("includes rows whose coverage exceeds the threshold", () => {
    const rows = [row({ performanceTier: "baixa", coverageDays: 45 })];
    assert.equal(buildSlowMoverRows(rows, 30).length, 1);
  });

  it("excludes rows within the coverage threshold", () => {
    const rows = [row({ performanceTier: "alta", coverageDays: 10 })];
    assert.equal(buildSlowMoverRows(rows, 30).length, 0);
  });

  it("sorts null coverage first, then descending by coverage", () => {
    const rows = [
      row({ performanceTier: "baixa", coverageDays: 40 }),
      row({ performanceTier: "zero", coverageDays: null }),
      row({ performanceTier: "baixa", coverageDays: 90 }),
    ];
    const result = buildSlowMoverRows(rows, 30);
    assert.equal(result[0].coverageDays, null);
    assert.equal(result[1].coverageDays, 90);
    assert.equal(result[2].coverageDays, 40);
  });
});
