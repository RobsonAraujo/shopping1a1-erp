import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeRevenuePotentialRowsBySku } from "../revenue-potential";
import type { RevenuePotentialRow } from "@/lib/insights/types";

function makeRow(overrides: Partial<RevenuePotentialRow>): RevenuePotentialRow {
  return {
    mlItemId: "MLB1",
    title: "Produto",
    sku: "SKU A",
    status: "active",
    imageUrl: null,
    price: 100,
    dailyAvgEstimate: 1,
    potentialMonthlyRevenue: 3000,
    currentMonthlyRevenue: 3000,
    gap: 0,
    estimateBasis: "recent",
    unitCost: 50,
    hasIcmsSt: false,
    supplierName: null,
    ...overrides,
  };
}

describe("mergeRevenuePotentialRowsBySku", () => {
  it("leaves a single-listing sku untouched", () => {
    const rows = [makeRow({ mlItemId: "MLB1", sku: "SKU A" })];
    const merged = mergeRevenuePotentialRowsBySku(rows);
    assert.equal(merged.length, 1);
    assert.deepEqual(merged[0], rows[0]);
  });

  it("sums revenue numbers across 2 mlItemId sharing the same sku", () => {
    const rows = [
      makeRow({
        mlItemId: "MLB7680193850",
        sku: "Alltec - 2001 VO/GA (Catálogo)",
        status: "active",
        dailyAvgEstimate: 2,
        potentialMonthlyRevenue: 6000,
        currentMonthlyRevenue: 6000,
        gap: 0,
        estimateBasis: "recent",
      }),
      makeRow({
        mlItemId: "MLB5713296080",
        sku: "Alltec - 2001 VO/GA (Catálogo)",
        status: "paused",
        dailyAvgEstimate: 1,
        potentialMonthlyRevenue: 3000,
        currentMonthlyRevenue: 0,
        gap: 3000,
        estimateBasis: "historical",
      }),
    ];

    const merged = mergeRevenuePotentialRowsBySku(rows);

    assert.equal(merged.length, 1);
    assert.equal(merged[0]?.dailyAvgEstimate, 3);
    assert.equal(merged[0]?.potentialMonthlyRevenue, 9000);
    assert.equal(merged[0]?.currentMonthlyRevenue, 6000);
    assert.equal(merged[0]?.gap, 3000);
    // "recent" vence porque pelo menos um dos anúncios está vendendo agora.
    assert.equal(merged[0]?.estimateBasis, "recent");
    // Anúncio ativo é o canônico pra campos de exibição (status/preço/etc.).
    assert.equal(merged[0]?.mlItemId, "MLB7680193850");
    assert.equal(merged[0]?.status, "active");
  });

  it("never merges listings without sku, even if both are null", () => {
    const rows = [
      makeRow({ mlItemId: "MLB1", sku: null, potentialMonthlyRevenue: 1000 }),
      makeRow({ mlItemId: "MLB2", sku: null, potentialMonthlyRevenue: 2000 }),
    ];

    const merged = mergeRevenuePotentialRowsBySku(rows);

    assert.equal(merged.length, 2);
  });
});
