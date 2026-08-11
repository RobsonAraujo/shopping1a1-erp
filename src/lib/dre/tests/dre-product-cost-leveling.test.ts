import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLevelingPricingToMap,
  applyLevelingsForOrderDate,
  computeLevelingPricingCost,
  dateRangesOverlap,
  enumerateMonthsOverlappingDateRange,
  isValidDatePeriod,
  resolveLevelingCostForOrderDate,
} from "../dre-product-cost-leveling-shared";
import type { ResolvedProductPricing } from "@/lib/product-pricing";

describe("dre-product-cost-leveling helpers", () => {
  it("validates inclusive date periods", () => {
    assert.equal(isValidDatePeriod("2026-01-15", "2026-03-10"), true);
    assert.equal(isValidDatePeriod("2026-03-10", "2026-01-15"), false);
    assert.equal(isValidDatePeriod("2026-02-30", "2026-03-01"), false);
  });

  it("detects overlapping date ranges", () => {
    assert.equal(
      dateRangesOverlap(
        { startDate: "2026-01-01", endDate: "2026-01-31" },
        { startDate: "2026-01-31", endDate: "2026-02-15" },
      ),
      true,
    );
    assert.equal(
      dateRangesOverlap(
        { startDate: "2026-01-01", endDate: "2026-01-30" },
        { startDate: "2026-01-31", endDate: "2026-02-15" },
      ),
      false,
    );
  });

  it("enumerates months overlapping a date range", () => {
    assert.deepEqual(
      enumerateMonthsOverlappingDateRange("2025-12-15", "2026-02-10"),
      [
        { year: 2025, month: 12 },
        { year: 2026, month: 1 },
        { year: 2026, month: 2 },
      ],
    );
  });

  it("computes pricing cost for NF and ST+IPI", () => {
    assert.equal(
      computeLevelingPricingCost({
        hasIcmsSt: false,
        unitCostNf: 41,
        purchaseCostWithSt: null,
        ipiPercent: 0,
      }),
      41,
    );
    assert.equal(
      computeLevelingPricingCost({
        hasIcmsSt: true,
        unitCostNf: 0,
        purchaseCostWithSt: 50,
        ipiPercent: 5,
      }),
      52.5,
    );
  });

  it("resolves leveling by order date inside/outside the range", () => {
    const levelings = [
      {
        sku: "SKU-A",
        startDate: "2026-01-15",
        endDate: "2026-03-10",
        pricingCost: 41,
      },
    ];
    assert.equal(
      resolveLevelingCostForOrderDate(levelings, "SKU-A", "2026-02-01", 2026, 2),
      41,
    );
    assert.equal(
      resolveLevelingCostForOrderDate(levelings, "SKU-A", "2026-01-10", 2026, 1),
      null,
    );
    assert.equal(
      resolveLevelingCostForOrderDate(levelings, "SKU-A", null, 2026, 2),
      41,
    );
  });

  it("applies leveling for a specific order date on the pricing map", () => {
    const pricingBySku = new Map<string, ResolvedProductPricing>([
      ["SKU-A", { pricingCost: 80, taxPercent: 12, extraCosts: 1 }],
      ["SKU-B", { pricingCost: 20, taxPercent: 10, extraCosts: 0 }],
    ]);
    const { pricing, leveledSkus } = applyLevelingsForOrderDate(
      pricingBySku,
      [
        {
          sku: "SKU-A",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          pricingCost: 41,
        },
      ],
      "2026-01-20",
      2026,
      1,
    );

    assert.deepEqual([...leveledSkus], ["SKU-A"]);
    assert.equal(pricing.get("SKU-A")?.pricingCost, 41);
    assert.equal(pricing.get("SKU-B")?.pricingCost, 20);
    assert.equal(pricingBySku.get("SKU-A")?.pricingCost, 80);
  });

  it("applies leveling over cadastro map only for overridden SKUs", () => {
    const pricingBySku = new Map<string, ResolvedProductPricing>([
      ["SKU-A", { pricingCost: 80, taxPercent: 12, extraCosts: 1 }],
    ]);
    applyLevelingPricingToMap(pricingBySku, new Map([["SKU-A", 41]]));
    assert.equal(pricingBySku.get("SKU-A")?.pricingCost, 41);
  });
});
