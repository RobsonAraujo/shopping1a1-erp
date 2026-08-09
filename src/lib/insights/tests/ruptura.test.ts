import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRupturaRows } from "../ruptura";
import type { PurchaseAnalysisItemRow } from "@/lib/purchase-analysis-rows";

function row(overrides: {
  id?: string;
  status?: string;
  coverageDays?: number | null;
  leadTime?: number;
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
    purchaseLeadTimeDays: overrides.leadTime ?? 5,
    analysis: {
      coverageDays: overrides.coverageDays ?? null,
      dailyAvg: 1,
      unitsSoldInWindow: 5,
      performanceTier: "media",
    },
  } as unknown as PurchaseAnalysisItemRow;
}

describe("buildRupturaRows", () => {
  it("only considers active listings", () => {
    const rows = [row({ status: "paused", coverageDays: 1, leadTime: 5 })];
    assert.deepEqual(buildRupturaRows(rows), []);
  });

  it("excludes rows with null coverage (no sales data)", () => {
    const rows = [row({ coverageDays: null, leadTime: 5 })];
    assert.deepEqual(buildRupturaRows(rows), []);
  });

  it("excludes rows with zero/negative lead time (nothing to compare against)", () => {
    const rows = [row({ coverageDays: 1, leadTime: 0 })];
    assert.deepEqual(buildRupturaRows(rows), []);
  });

  it("includes rows whose coverage is below the purchase lead time", () => {
    const rows = [row({ coverageDays: 2, leadTime: 5 })];
    const result = buildRupturaRows(rows);
    assert.equal(result.length, 1);
  });

  it("excludes rows whose coverage is at/above the lead time", () => {
    const rows = [row({ coverageDays: 5, leadTime: 5 })];
    assert.deepEqual(buildRupturaRows(rows), []);
  });

  it("sorts ascending by coverage days (most urgent first)", () => {
    const rows = [
      row({ id: "MLB1", coverageDays: 4, leadTime: 10 }),
      row({ id: "MLB2", coverageDays: 1, leadTime: 10 }),
    ];
    const result = buildRupturaRows(rows);
    assert.equal(result[0].mlItemId, "MLB2");
    assert.equal(result[1].mlItemId, "MLB1");
  });
});
